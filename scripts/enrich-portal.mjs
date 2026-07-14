#!/usr/bin/env node
// Scrapes per-gene TB Genome Portal pages for multi-source annotations and
// Culviner lineage pN/pS values. Writes public/data/portal-enrichment.json.
//
// Usage:
//   node scripts/enrich-portal.mjs
//   node scripts/enrich-portal.mjs --limit 50   # smoke test
//   node scripts/enrich-portal.mjs --concurrency 20

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const GENES = resolve(here, '../public/data/genes.json');
const OUT = resolve(here, '../public/data/portal-enrichment.json');
const BASE = 'https://orca2.tamu.edu/U19/pages';

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const concIdx = args.indexOf('--concurrency');
const concurrency = concIdx >= 0 ? Number(args[concIdx + 1]) : 16;

function strip(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseGenePage(html, orf) {
  const annotations = {};
  for (const label of ['TBDB', 'REFSEQ', 'PATRIC', 'TUBERCULIST', 'NCBI']) {
    const re = new RegExp(`${label}:\\s*([^<\\n]+)`, 'i');
    const m = re.exec(html);
    if (m) annotations[label] = strip(m[1]);
  }

  const pnps = {};
  const overall = /overall pN\/pS for [^:]+:\s*([0-9.]+)/i.exec(html);
  if (overall) pnps.overall = Number(overall[1]);
  for (const lineage of ['L1', 'L2', 'L3', 'L4']) {
    const m = new RegExp(`lineage-specific pN\\/pS in ${lineage}:\\s*([0-9.]+)`, 'i').exec(html);
    if (m) pnps[lineage] = Number(m[1]);
  }

  const under = /under significant positive selection\?<TD>(?:<B>\s*)*(YES|NO)/i.exec(html);
  const peak = /omega peak height \(95%CI lower bound\)<TD>\s*([0-9.]+)\s*\(([0-9.]+)\)/i.exec(html);

  let sequence = null;
  const pre = /Amino Acid Sequence[\s\S]*?<PRE[^>]*>([\s\S]*?)<\/PRE>/i.exec(html);
  if (pre) sequence = pre[1].replace(/\s+/g, '');

  return {
    orf,
    annotations,
    pnps: Object.keys(pnps).length ? pnps : undefined,
    underSelection: under ? under[1].toUpperCase() === 'YES' : undefined,
    omegaPeak: peak ? Number(peak[1]) : undefined,
    omegaLower: peak ? Number(peak[2]) : undefined,
    sequence: sequence || undefined,
  };
}

async function fetchOne(orf) {
  const url = `${BASE}/${encodeURIComponent(orf)}.html`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${orf}: HTTP ${res.status}`);
  return parseGenePage(await res.text(), orf);
}

async function mapPool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
  return out;
}

const catalog = JSON.parse(readFileSync(GENES, 'utf8'));
const orfs = catalog.genes.map((g) => g.o).slice(0, Number.isFinite(limit) ? limit : undefined);
const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { genes: {} };

console.log(`Enriching ${orfs.length} genes (concurrency ${concurrency})…`);
let ok = 0;
let fail = 0;

const results = await mapPool(orfs, concurrency, async (orf, idx) => {
  try {
    const row = await fetchOne(orf);
    ok += 1;
    if ((idx + 1) % 100 === 0 || idx + 1 === orfs.length) {
      console.log(`  ${idx + 1}/${orfs.length} (ok=${ok}, fail=${fail})`);
    }
    return row;
  } catch (err) {
    fail += 1;
    console.warn(`  fail ${orf}: ${err.message}`);
    return null;
  }
});

const genes = { ...(existing.genes || {}) };
for (const row of results) {
  if (!row) continue;
  const compact = {};
  if (row.annotations && Object.keys(row.annotations).length) compact.a = row.annotations;
  if (row.pnps) compact.p = row.pnps;
  if (row.underSelection !== undefined) compact.u = row.underSelection;
  if (row.omegaPeak !== undefined) compact.op = row.omegaPeak;
  if (row.omegaLower !== undefined) compact.ol = row.omegaLower;
  if (row.sequence) compact.s = row.sequence;
  genes[row.orf] = compact;
}

const payload = {
  source: BASE,
  builtAt: new Date().toISOString(),
  count: Object.keys(genes).length,
  genes,
};

writeFileSync(OUT, `${JSON.stringify(payload)}\n`);
console.log(`Wrote ${OUT} (${payload.count} genes, ${ok} fetched, ${fail} failed).`);
