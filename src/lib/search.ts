import type { Gene } from './types';

// Ranked substring search over the catalog. Scoring favours, in order:
// exact ORF/gene hits, prefix hits on the identifiers, then annotation matches.
// Fast enough to run on every keystroke over the full 4k-gene set.
//
// Queries may mix a gene identifier with an extra term that is not in the
// catalog (`Rv0001 rifampin`). Tokens that hit any gene stay in the catalog
// search; tokens that hit nothing are extra terms for literature, not a reason
// to return zero genes.

export interface SearchHit {
  gene: Gene;
  score: number;
}

export interface ParsedGeneQuery {
  raw: string;
  /** Whitespace-separated tokens that match at least one catalog field. */
  catalogQuery: string;
  /** Tokens that match no gene — intended for literature, not catalog AND. */
  extraTerms: string;
}

function scoreGene(gene: Gene, q: string): number {
  const orf = gene.orf.toLowerCase();
  const sym = gene.gene?.toLowerCase() ?? '';
  const ann = gene.annotation.toLowerCase();
  const acc = gene.uniprot?.toLowerCase() ?? '';

  if (orf === q || sym === q || (acc && acc === q)) return 1000;
  let score = 0;
  if (orf.startsWith(q)) score = Math.max(score, 800 - (orf.length - q.length));
  if (sym && sym.startsWith(q)) score = Math.max(score, 780 - (sym.length - q.length));
  if (acc && acc.startsWith(q)) score = Math.max(score, 760 - (acc.length - q.length));
  if (score === 0 && orf.includes(q)) score = 500;
  if (sym.includes(q)) score = Math.max(score, 520);
  if (acc && acc.includes(q)) score = Math.max(score, 510);
  if (score === 0) {
    const idx = ann.indexOf(q);
    if (idx === 0) score = 300;
    else if (idx > 0) {
      // Word-boundary annotation hits rank above mid-word ones.
      score = ann[idx - 1] === ' ' ? 220 : 140;
    }
  }
  return score;
}

function tokenHitsCatalog(genes: Gene[], token: string): boolean {
  const q = token.toLowerCase();
  for (const gene of genes) {
    if (scoreGene(gene, q) > 0) return true;
  }
  return false;
}

export function parseGeneQuery(genes: Gene[], query: string): ParsedGeneQuery {
  const raw = query.trim();
  if (!raw) return { raw: '', catalogQuery: '', extraTerms: '' };
  const tokens = raw.split(/\s+/).filter(Boolean);
  const catalog: string[] = [];
  const extra: string[] = [];
  for (const token of tokens) {
    if (tokenHitsCatalog(genes, token)) catalog.push(token);
    else extra.push(token);
  }
  return {
    raw,
    catalogQuery: catalog.join(' '),
    extraTerms: extra.join(' '),
  };
}

export function searchGenes(genes: Gene[], query: string, limit = 50): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];
  for (const gene of genes) {
    let total = 0;
    let ok = true;
    for (const t of terms) {
      const s = scoreGene(gene, t);
      if (s === 0) {
        ok = false;
        break;
      }
      total += s;
    }
    if (ok) hits.push({ gene, score: total / terms.length });
  }
  hits.sort((a, b) => b.score - a.score || a.gene.start - b.gene.start);
  return hits.slice(0, limit);
}

/** Catalog search that ignores extra (non-catalog) tokens instead of failing closed. */
export function searchGenesParsed(genes: Gene[], query: string, limit = 50): {
  hits: SearchHit[];
  parsed: ParsedGeneQuery;
} {
  const parsed = parseGeneQuery(genes, query);
  const hits = parsed.catalogQuery ? searchGenes(genes, parsed.catalogQuery, limit) : [];
  return { hits, parsed };
}
