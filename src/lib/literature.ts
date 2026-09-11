// Literature for a gene, from public sources the browser can call directly.
//
// Europe PMC remains the ranked paper list (it already includes PubMed and PMC
// records, and its REST API is CORS-open). UniProt curated citations are merged
// in without displacing that ranking. Outbound chips cover PubMed, PMC, UniProt,
// Mycobrowser and the TB Genome Portal so a user can keep going when the
// in-page list is the wrong slice.
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
import { normalizeUniprot, uniprotHref, uniprotRecordUrl } from './external';
import { portalGenePage } from './portalPlots';

const EUROPE_PMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
const UNIPROT_REST = 'https://rest.uniprot.org/uniprotkb';

export type QueryScope = 'title-abstract' | 'full-text';
export type LiteratureSort = 'cited' | 'date' | 'relevance';
export type LiteratureOrigin = 'europepmc' | 'uniprot';

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
  /** Best landing page: DOI, then PubMed, then PMC, then Europe PMC / UniProt. */
  url: string;
  pubmedUrl: string | null;
  pmcUrl: string | null;
  doiUrl: string | null;
  europepmcUrl: string | null;
  origins: LiteratureOrigin[];
}

export interface GeneLiterature {
  count: number;
  papers: Paper[];
  /** Which query produced these results, so the UI can say so. */
  scope: QueryScope;
  sort: LiteratureSort;
  extraTerms: string;
  backends: LiteratureOrigin[];
}

export interface LiteratureOptions {
  limit?: number;
  signal?: AbortSignal;
  extraTerms?: string;
  sort?: LiteratureSort;
}

export interface ElsewhereLink {
  id: string;
  label: string;
  href: string;
}

function quote(value: string): string {
  return `"${value.replace(/"/g, ' ').trim()}"`;
}

function extraClause(extraTerms: string, scope: QueryScope): string {
  const tokens = extraTerms.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return '';
  const field = scope === 'title-abstract' ? 'TITLE_ABS:' : '';
  return tokens.map((token) => `${field}${quote(token)}`).join(' AND ');
}

function identifierClause(gene: Gene, scope: QueryScope): string {
  const names = [gene.orf];
  if (gene.gene && gene.gene.toLowerCase() !== gene.orf.toLowerCase()) names.push(gene.gene);
  const accession = normalizeUniprot(gene.uniprot);
  if (accession) names.push(accession);
  const field = scope === 'title-abstract' ? 'TITLE_ABS:' : '';
  return names.map((name) => `${field}${quote(name)}`).join(' OR ');
}

/**
 * The identifiers this gene is known by, paired with the organism so a locus
 * tag that collides with another species' gene symbol does not drag in its
 * literature. Extra tokens (rifampin, essential, …) are ANDed on.
 */
export function geneQuery(gene: Gene, scope: QueryScope = 'title-abstract', extraTerms = ''): string {
  const organism = '(tuberculosis OR mycobacterium)';
  let query = `(${identifierClause(gene, scope)}) AND ${organism}`;
  const extra = extraClause(extraTerms, scope);
  if (extra) query += ` AND ${extra}`;
  return query;
}

export function termQuery(term: string, scope: QueryScope = 'title-abstract'): string {
  const extra = extraClause(term, scope);
  return extra ? `${extra} AND (tuberculosis OR mycobacterium)` : '(tuberculosis OR mycobacterium)';
}

function europePmcSort(sort: LiteratureSort): string | undefined {
  if (sort === 'cited') return 'CITED desc';
  if (sort === 'date') return 'P_PDATE_D desc';
  return undefined;
}

function europePmcUrl(query: string, pageSize: number, sort: LiteratureSort): string {
  const params = new URLSearchParams({
    query,
    format: 'json',
    resultType: 'core',
    pageSize: String(pageSize),
  });
  const sortValue = europePmcSort(sort);
  if (sortValue) params.set('sort', sortValue);
  return `${EUROPE_PMC}?${params.toString()}`;
}

export function pubmedUrlFor(pmid: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pmid)}/`;
}

export function pmcUrlFor(pmcid: string): string {
  return `https://www.ncbi.nlm.nih.gov/pmc/articles/${encodeURIComponent(pmcid)}/`;
}

export function doiUrlFor(doi: string): string {
  return `https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}`;
}

function europePmcArticleUrl(source: string, id: string): string {
  return `https://europepmc.org/article/${encodeURIComponent(source)}/${encodeURIComponent(id)}`;
}

function bestUrl(paper: Pick<Paper, 'doiUrl' | 'pubmedUrl' | 'pmcUrl' | 'europepmcUrl' | 'url'>): string {
  return paper.doiUrl ?? paper.pubmedUrl ?? paper.pmcUrl ?? paper.europepmcUrl ?? paper.url;
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

export function toPaper(raw: RawResult, origin: LiteratureOrigin = 'europepmc'): Paper | null {
  const title = (raw.title ?? '').replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  if (!title) return null;
  const id = raw.id ?? raw.pmid ?? raw.pmcid ?? raw.doi ?? title;
  const source = raw.source ?? (origin === 'uniprot' ? 'UNIPROT' : 'MED');
  const pmid = raw.pmid?.trim() || null;
  const pmcid = raw.pmcid?.trim() || null;
  const doi = raw.doi?.trim() || null;
  const europepmcUrl = origin === 'europepmc' ? europePmcArticleUrl(source, id) : null;
  const paper: Paper = {
    id,
    source,
    pmid,
    pmcid,
    doi,
    title,
    authors: raw.authorString?.replace(/\s+/g, ' ').trim() || null,
    journal: raw.journalTitle?.trim() || raw.bookOrReportDetails?.publisher?.trim() || null,
    year: raw.pubYear ?? null,
    citedBy: typeof raw.citedByCount === 'number' ? raw.citedByCount : null,
    isPreprint: /preprint/i.test(raw.pubType ?? '') || source === 'PPR',
    isOpenAccess: raw.isOpenAccess === 'Y',
    url: '',
    pubmedUrl: pmid ? pubmedUrlFor(pmid) : null,
    pmcUrl: pmcid ? pmcUrlFor(pmcid) : null,
    doiUrl: doi ? doiUrlFor(doi) : null,
    europepmcUrl,
    origins: [origin],
  };
  paper.url = bestUrl(paper);
  return paper;
}

function paperKey(paper: Paper): string {
  if (paper.pmid) return `pmid:${paper.pmid}`;
  if (paper.doi) return `doi:${paper.doi.toLowerCase()}`;
  if (paper.pmcid) return `pmc:${paper.pmcid.toLowerCase()}`;
  return `title:${paper.title.toLowerCase()}`;
}

function mergePapers(ranked: Paper[], extra: Paper[]): Paper[] {
  const seen = new Set(ranked.map(paperKey));
  const out = [...ranked];
  for (const paper of extra) {
    const key = paperKey(paper);
    const existing = out.find((row) => paperKey(row) === key);
    if (existing) {
      for (const origin of paper.origins) {
        if (!existing.origins.includes(origin)) existing.origins.push(origin);
      }
      existing.pubmedUrl ??= paper.pubmedUrl;
      existing.pmcUrl ??= paper.pmcUrl;
      existing.doiUrl ??= paper.doiUrl;
      existing.pmid ??= paper.pmid;
      existing.pmcid ??= paper.pmcid;
      existing.doi ??= paper.doi;
      existing.authors ??= paper.authors;
      existing.url = bestUrl(existing);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(paper);
  }
  return out;
}

function titleMatchesExtra(title: string, extraTerms: string): boolean {
  const tokens = extraTerms.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const hay = title.toLowerCase();
  return tokens.every((token) => hay.includes(token));
}

interface UniProtCitation {
  citationType?: string;
  title?: string;
  publicationDate?: string;
  journal?: string;
  authors?: string[];
  citationCrossReferences?: { database?: string; id?: string }[];
}

async function uniprotPapers(accession: string, extraTerms: string, signal?: AbortSignal): Promise<Paper[]> {
  const res = await fetch(`${UNIPROT_REST}/${encodeURIComponent(accession)}?format=json`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`UniProt returned HTTP ${res.status}.`);
  const body = (await res.json()) as { references?: { citation?: UniProtCitation }[] };
  const papers: Paper[] = [];
  for (const row of body.references ?? []) {
    const citation = row.citation;
    if (!citation?.title) continue;
    const xrefs = citation.citationCrossReferences ?? [];
    const pmid = xrefs.find((x) => x.database === 'PubMed')?.id ?? null;
    const doi = xrefs.find((x) => x.database === 'DOI')?.id ?? null;
    if (!pmid && !doi) continue;
    if (!titleMatchesExtra(citation.title, extraTerms)) continue;
    const year = citation.publicationDate?.match(/\d{4}/)?.[0] ?? null;
    const paper = toPaper(
      {
        id: pmid ?? doi ?? citation.title,
        source: 'UNIPROT',
        pmid: pmid ?? undefined,
        doi: doi ?? undefined,
        title: citation.title,
        authorString: citation.authors?.join(', '),
        journalTitle: citation.journal,
        pubYear: year ?? undefined,
        pubType: citation.citationType,
      },
      'uniprot',
    );
    if (paper) papers.push(paper);
  }
  return papers;
}

async function searchEuropePmc(
  query: string,
  pageSize: number,
  sort: LiteratureSort,
  signal?: AbortSignal,
): Promise<{ count: number; papers: Paper[] }> {
  const res = await fetch(europePmcUrl(query, pageSize, sort), { signal });
  if (!res.ok) throw new Error(`Europe PMC returned HTTP ${res.status}.`);
  const body = (await res.json()) as { hitCount?: number; resultList?: { result?: RawResult[] } };
  const papers = (body.resultList?.result ?? []).map((raw) => toPaper(raw, 'europepmc')).filter((p): p is Paper => p !== null);
  return { count: typeof body.hitCount === 'number' ? body.hitCount : papers.length, papers };
}

async function searchScoped(
  queryFor: (scope: QueryScope) => string,
  limit: number,
  sort: LiteratureSort,
  signal?: AbortSignal,
): Promise<{ count: number; papers: Paper[]; scope: QueryScope }> {
  const scoped = await searchEuropePmc(queryFor('title-abstract'), limit, sort, signal);
  if (scoped.count > 0) return { ...scoped, scope: 'title-abstract' };
  const wide = await searchEuropePmc(queryFor('full-text'), limit, sort, signal);
  return { ...wide, scope: 'full-text' };
}

async function mergeUniprot(
  gene: Gene,
  extraTerms: string,
  ranked: { count: number; papers: Paper[] },
  signal?: AbortSignal,
): Promise<{ count: number; papers: Paper[]; backends: LiteratureOrigin[] }> {
  const accession = normalizeUniprot(gene.uniprot);
  if (!accession) return { ...ranked, backends: ['europepmc'] };
  try {
    const extra = await uniprotPapers(accession, extraTerms, signal);
    return {
      count: ranked.count,
      papers: mergePapers(ranked.papers, extra),
      backends: extra.length ? ['europepmc', 'uniprot'] : ['europepmc'],
    };
  } catch {
    // UniProt is additive. A failure must not hide the ranked Europe PMC list.
    return { ...ranked, backends: ['europepmc'] };
  }
}

/** Hit count only. Used for the ranking, where the papers themselves are not needed. */
export async function literatureCount(gene: Gene, signal?: AbortSignal): Promise<number> {
  const { count } = await searchEuropePmc(geneQuery(gene, 'title-abstract'), 1, 'cited', signal);
  return count;
}

/**
 * Papers for one gene. Widens from title/abstract to full text only when the
 * precise query found nothing, so a rarely-named locus still surfaces its
 * papers instead of reporting an empty literature.
 */
export async function geneLiterature(gene: Gene, options: LiteratureOptions = {}): Promise<GeneLiterature> {
  const limit = options.limit ?? 25;
  const extraTerms = options.extraTerms?.trim() ?? '';
  const sort = options.sort ?? (extraTerms ? 'relevance' : 'cited');
  const epmc = await searchScoped((scope) => geneQuery(gene, scope, extraTerms), limit, sort, options.signal);
  const merged = await mergeUniprot(gene, extraTerms, epmc, options.signal);
  return { ...epmc, ...merged, sort, extraTerms };
}

/** Organism-scoped papers for a term that is not a catalog gene (`essential`). */
export async function termLiterature(term: string, options: LiteratureOptions = {}): Promise<GeneLiterature> {
  const extraTerms = term.trim();
  const limit = options.limit ?? 25;
  const sort = options.sort ?? 'relevance';
  const epmc = await searchScoped((scope) => termQuery(extraTerms, scope), limit, sort, options.signal);
  return { ...epmc, sort, extraTerms, backends: ['europepmc'] };
}

export function literatureElsewhere(gene: Gene | null, extraTerms = ''): ElsewhereLink[] {
  const term = extraTerms.trim();
  const names = gene ? [gene.orf, gene.gene, gene.uniprot].filter((v): v is string => Boolean(v)) : [];
  const pubmedBits = [...names, term, gene ? 'Mycobacterium tuberculosis' : 'Mycobacterium tuberculosis'].filter(Boolean);
  const pubmed = `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(pubmedBits.join(' '))}`;
  const pmc = `https://www.ncbi.nlm.nih.gov/pmc/?term=${encodeURIComponent(pubmedBits.join(' '))}`;
  const epmcQuery = gene ? geneQuery(gene, 'title-abstract', term) : termQuery(term);
  const links: ElsewhereLink[] = [
    { id: 'pubmed', label: 'PubMed', href: pubmed },
    { id: 'pmc', label: 'PMC', href: pmc },
    {
      id: 'europepmc',
      label: 'Europe PMC',
      href: `https://europepmc.org/search?query=${encodeURIComponent(epmcQuery)}`,
    },
  ];
  if (gene) {
    const accession = normalizeUniprot(gene.uniprot);
    links.push({
      id: 'uniprot',
      label: 'UniProt',
      href: accession ? `${uniprotRecordUrl(accession)}#publications` : uniprotHref(gene),
    });
    links.push({
      id: 'mycobrowser',
      label: 'Mycobrowser',
      href: `https://mycobrowser.epfl.ch/genes/${encodeURIComponent(gene.orf)}`,
    });
    links.push({ id: 'tbportal', label: 'TB Genome Portal', href: portalGenePage(gene.orf) });
  }
  return links.filter((link) => link.href);
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
