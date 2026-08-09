// Literature for a gene, from Europe PMC's key-less public REST API.
//
// The hard part is not fetching, it is asking a question that means "papers
// about this gene". A bare identifier search matches every reference list that
// happens to cite a paper naming the gene, so relA returns ten thousand hits
// of which almost none are about relA. Scoping the identifiers to title and
// abstract fixes that (relA: 10,390 -> 214), at the cost of missing genes that
// are only ever named in a methods table or a supplementary file. So the
// scoped query is the default and the unscoped one is the fallback, used only
// when scoping found nothing at all.

import type { Gene } from './types';

const BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

export type QueryScope = 'title-abstract' | 'full-text';

export interface Paper {
  id: string;
  source: string;
  pmid: string | null;
  pmcid: string | null;
  doi: string | null;
  title: string;
  authors: string | null;
  journal: string | null;
  year: string | null;
  citedBy: number | null;
  isPreprint: boolean;
  isOpenAccess: boolean;
  /** europepmc.org page for the record; always present, unlike a DOI. */
  url: string;
}

export interface GeneLiterature {
  count: number;
  papers: Paper[];
  /** Which query produced these results, so the UI can say so. */
  scope: QueryScope;
}

/**
 * The identifiers this gene is known by, paired with the organism so a locus
 * tag that collides with another species' gene symbol does not drag in its
 * literature.
 */
export function geneQuery(gene: Gene, scope: QueryScope = 'title-abstract'): string {
  const names = [gene.orf];
  if (gene.gene && gene.gene.toLowerCase() !== gene.orf.toLowerCase()) names.push(gene.gene);
  const field = scope === 'title-abstract' ? 'TITLE_ABS:' : '';
  const any = names.map((name) => `${field}"${name}"`).join(' OR ');
  return `(${any}) AND (tuberculosis OR mycobacterium)`;
}

function url(query: string, pageSize: number): string {
  const params = new URLSearchParams({
    query,
    format: 'json',
    resultType: 'core',
    pageSize: String(pageSize),
    sort: 'CITED desc',
  });
  return `${BASE}?${params.toString()}`;
}

interface RawResult {
  id?: string;
  source?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  journalTitle?: string;
  bookOrReportDetails?: { publisher?: string };
  pubYear?: string;
  citedByCount?: number;
  pubType?: string;
  isOpenAccess?: string;
}

function toPaper(raw: RawResult): Paper | null {
  const title = (raw.title ?? '').replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  if (!title) return null;
  const id = raw.id ?? raw.pmid ?? raw.pmcid ?? raw.doi ?? title;
  const source = raw.source ?? 'MED';
  return {
    id,
    source,
    pmid: raw.pmid ?? null,
    pmcid: raw.pmcid ?? null,
    doi: raw.doi ?? null,
    title,
    authors: raw.authorString?.replace(/\s+/g, ' ').trim() || null,
    journal: raw.journalTitle?.trim() || raw.bookOrReportDetails?.publisher?.trim() || null,
    year: raw.pubYear ?? null,
    citedBy: typeof raw.citedByCount === 'number' ? raw.citedByCount : null,
    isPreprint: /preprint/i.test(raw.pubType ?? '') || source === 'PPR',
    isOpenAccess: raw.isOpenAccess === 'Y',
    url: `https://europepmc.org/article/${source}/${id}`,
  };
}

async function search(query: string, pageSize: number, signal?: AbortSignal): Promise<{ count: number; papers: Paper[] }> {
  const res = await fetch(url(query, pageSize), { signal });
  if (!res.ok) throw new Error(`Europe PMC returned HTTP ${res.status}.`);
  const body = (await res.json()) as { hitCount?: number; resultList?: { result?: RawResult[] } };
  const papers = (body.resultList?.result ?? []).map(toPaper).filter((p): p is Paper => p !== null);
  return { count: typeof body.hitCount === 'number' ? body.hitCount : papers.length, papers };
}

/** Hit count only. Used for the ranking, where the papers themselves are not needed. */
export async function literatureCount(gene: Gene, signal?: AbortSignal): Promise<number> {
  const { count } = await search(geneQuery(gene, 'title-abstract'), 1, signal);
  return count;
}

/**
 * Papers for one gene. Widens from title/abstract to full text only when the
 * precise query found nothing, so a rarely-named locus still surfaces its
 * papers instead of reporting an empty literature.
 */
export async function geneLiterature(gene: Gene, limit = 25, signal?: AbortSignal): Promise<GeneLiterature> {
  const scoped = await search(geneQuery(gene, 'title-abstract'), limit, signal);
  if (scoped.count > 0) return { ...scoped, scope: 'title-abstract' };
  const wide = await search(geneQuery(gene, 'full-text'), limit, signal);
  return { ...wide, scope: 'full-text' };
}

/**
 * Counts for many genes, a few requests at a time. Europe PMC is a shared
 * public service, so this is deliberately polite rather than fast; genes whose
 * request fails are simply absent from the map rather than recorded as zero,
 * which keeps "not fetched" distinguishable from "nothing published".
 */
export async function literatureCounts(
  genes: Gene[],
  options: { concurrency?: number; signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<Map<string, number>> {
  const { concurrency = 4, signal, onProgress } = options;
  const out = new Map<string, number>();
  let index = 0;
  let done = 0;

  async function worker(): Promise<void> {
    for (;;) {
      if (signal?.aborted) return;
      const i = index++;
      if (i >= genes.length) return;
      const gene = genes[i];
      try {
        out.set(gene.orf, await literatureCount(gene, signal));
      } catch {
        // Leave it unset: absent means unknown, not zero.
      }
      done += 1;
      onProgress?.(done, genes.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, genes.length) }, worker));
  return out;
}
