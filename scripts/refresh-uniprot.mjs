#!/usr/bin/env node
// Builds scripts/source/uniprot-h37rv.json: ORF id -> UniProt accession.
//
// Primary source is the reviewed H37Rv proteome (UP000001584). Catalog ORFs
// still missing after that are filled from the UniProt href already present on
// the TB Genome Portal gene page. Never invents accessions.
//
// Usage: node scripts/refresh-uniprot.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const GENES = resolve(here, '../public/data/genes.json');
const OUT = resolve(here, 'source/uniprot-h37rv.json');
const PROTEOME = 'UP000001584';
const UNIPROT_STREAM =
  'https://rest.uniprot.org/uniprotkb/stream?compressed=false&format=tsv' +
  '&fields=accession,reviewed,gene_oln' +
  `&query=${encodeURIComponent(`(proteome:${PROTEOME})`)}`;
const PORTAL = 'https://orca2.tamu.edu/U19/pages';
const ACCESSION_RE = /\b([OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})\b/;

const catalog = JSON.parse(readFileSync(GENES, 'utf8'));
const orfs = catalog.genes.map((g) => g.o);
const orfSet = new Set(orfs);

function parseOln(value) {
  const parts = [];
  for (const chunk of String(value || '').replace(/[;,]/g, ' ').split(/\s+/)) {
    for (const piece of chunk.split('/')) {
      const orf = piece.trim();
      if (orf) parts.push(orf);
    }
  }
  return parts;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MtbScope UniProt mapping (https://harsh.bet/genes)', Accept: 'text/plain' },
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.text();
}

function mapFromTsv(tsv) {
  const lines = tsv.trim().split(/\r?\n/);
  const header = lines.shift()?.split('\t') ?? [];
  const accIdx = header.indexOf('Entry');
  const revIdx = header.indexOf('Reviewed');
  const olnIdx = header.indexOf('Gene Names (ordered locus)');
  if (accIdx < 0 || olnIdx < 0) throw new Error(`Unexpected UniProt TSV header: ${header.join(',')}`);

  /** @type {Map<string, { accession: string, reviewed: boolean }>} */
  const best = new Map();
  for (const line of lines) {
    const cols = line.split('\t');
    const accession = cols[accIdx]?.trim();
    if (!accession) continue;
    const reviewed = (cols[revIdx] ?? '') === 'reviewed';
    for (const orf of parseOln(cols[olnIdx] ?? '')) {
      if (!orfSet.has(orf)) continue;
      const prev = best.get(orf);
      if (!prev || (reviewed && !prev.reviewed)) best.set(orf, { accession, reviewed });
    }
  }
  return best;
}

async function portalAccession(orf) {
  const html = await fetchText(`${PORTAL}/${encodeURIComponent(orf)}.html`);
  const href = /https?:\/\/(?:www\.)?uniprot\.org\/(?:uniprot|uniprotkb)\/([A-Z0-9]+)/i.exec(html);
  const token = href?.[1] ?? ACCESSION_RE.exec(html)?.[1];
  return token ?? null;
}

const tsv = await fetchText(UNIPROT_STREAM);
const best = mapFromTsv(tsv);
const accessions = {};
const sources = { uniprot: 0, portal: 0, missing: 0 };

for (const orf of orfs) {
  const hit = best.get(orf);
  if (hit) {
    accessions[orf] = hit.accession;
    sources.uniprot += 1;
  }
}

const missing = orfs.filter((orf) => !accessions[orf]);
if (missing.length) {
  console.log(`Filling ${missing.length} catalog ORF(s) from portal gene pages…`);
  for (const orf of missing) {
    try {
      const acc = await portalAccession(orf);
      if (acc) {
        accessions[orf] = acc;
        sources.portal += 1;
        console.log(`  ${orf} -> ${acc} (portal)`);
      } else {
        sources.missing += 1;
        console.warn(`  ${orf}: no UniProt accession on the portal page`);
      }
    } catch (err) {
      sources.missing += 1;
      console.warn(`  ${orf}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

const payload = {
  source: {
    uniprotProteome: PROTEOME,
    uniprotQuery: `(proteome:${PROTEOME})`,
    portalFallback: `${PORTAL}/{orf}.html`,
  },
  builtAt: new Date().toISOString(),
  count: Object.keys(accessions).length,
  catalogCount: orfs.length,
  sources,
  accessions,
};

writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${OUT} (${payload.count}/${orfs.length} accessions; uniprot=${sources.uniprot}, portal=${sources.portal}, missing=${sources.missing}).`);
