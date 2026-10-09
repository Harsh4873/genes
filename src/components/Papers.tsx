import { ExternalLink, RefreshCw } from 'lucide-react';
import type { Gene } from '../lib/types';
import {
  literatureElsewhere,
  type GeneLiterature,
  type LiteratureSort,
  type Paper,
} from '../lib/literature';

export function PaperRow({ paper }: { paper: Paper }) {
  const authors = paper.authors && paper.authors.length > 96 ? `${paper.authors.slice(0, 93).trimEnd()}…` : paper.authors;
  return (
    <li className="gene-paper">
      <a className="gene-paper-title" href={paper.url} target="_blank" rel="noreferrer noopener">
        {paper.title}
      </a>
      {authors ? <div className="gene-paper-authors">{authors}</div> : null}
      <div className="gene-paper-meta">
        {paper.journal ? <span>{paper.journal}</span> : null}
        {paper.year ? <span>{paper.year}</span> : null}
        {paper.citedBy !== null ? <span>{paper.citedBy.toLocaleString()} citations</span> : null}
        {paper.isPreprint ? <span className="tag-preprint">Preprint</span> : null}
        {paper.isOpenAccess ? <span className="tag-open">Open access</span> : null}
        {paper.origins.includes('uniprot') ? <span className="tag-open">UniProt</span> : null}
      </div>
      <div className="gene-paper-links">
        {paper.pubmedUrl ? <a href={paper.pubmedUrl} target="_blank" rel="noreferrer noopener">PubMed {paper.pmid}</a> : null}
        {paper.pmcUrl ? <a href={paper.pmcUrl} target="_blank" rel="noreferrer noopener">{paper.pmcid ?? 'PMC'}</a> : null}
        {paper.doiUrl ? <a href={paper.doiUrl} target="_blank" rel="noreferrer noopener">DOI</a> : null}
        {paper.europepmcUrl ? <a href={paper.europepmcUrl} target="_blank" rel="noreferrer noopener">Europe PMC</a> : null}
      </div>
    </li>
  );
}

export function LiteratureSortToggles({
  value,
  onChange,
}: {
  value: LiteratureSort;
  onChange: (sort: LiteratureSort) => void;
}) {
  const options: { id: LiteratureSort; label: string }[] = [
    { id: 'cited', label: 'Citations' },
    { id: 'date', label: 'Date' },
    { id: 'relevance', label: 'Relevance' },
  ];
  return (
    <div className="chip-row" role="group" aria-label="Paper sort">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`chip${value === option.id ? ' on' : ''}`}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ElsewhereChips({ gene, extraTerms }: { gene: Gene | null; extraTerms?: string }) {
  return (
    <div className="gene-paper-links" style={{ marginTop: 8 }}>
      {literatureElsewhere(gene, extraTerms).map((link) => (
        <a key={link.id} href={link.href} target="_blank" rel="noreferrer noopener">
          {link.label} <ExternalLink size={11} aria-hidden />
        </a>
      ))}
    </div>
  );
}

export type PaperSetId = 'combined' | 'gene' | 'terms';

export interface PaperSetTab {
  id: PaperSetId;
  label: string;
  count: number;
}

/**
 * Tabs for a gene-plus-terms literature view: papers naming both first, with
 * the gene-only and term-only counts beside them so a zero combined result
 * still shows what each half matches on its own.
 */
export function paperSetTabs(
  geneLabel: string,
  termsLabel: string,
  counts: Record<PaperSetId, number>,
): PaperSetTab[] {
  return [
    { id: 'combined', label: `${geneLabel} + ${termsLabel}`, count: counts.combined },
    { id: 'gene', label: geneLabel, count: counts.gene },
    { id: 'terms', label: `“${termsLabel}”`, count: counts.terms },
  ];
}

export function PaperList({
  papers,
  busy,
  error,
  extraTerms,
  gene,
  empty,
  fullTextNote,
  hideFilterNote,
}: {
  papers: GeneLiterature | null;
  busy: boolean;
  error: string | null;
  extraTerms?: string;
  gene: Gene | null;
  empty?: string;
  /** Overrides the default full-text fallback note (for term-only lists). */
  fullTextNote?: string;
  /** Keeps extraTerms for the outbound chips without the "filtered to" note. */
  hideFilterNote?: boolean;
}) {
  return (
    <>
      {busy ? (
        <p className="dim" style={{ fontSize: 13.5 }}>
          <RefreshCw size={13} className="spin" aria-hidden /> Searching PubMed/PMC via Europe PMC
          {gene?.uniprot ? ' and UniProt citations' : ''}…
        </p>
      ) : error ? (
        <p className="lock-error">{error}</p>
      ) : papers && papers.papers.length ? (
        <>
          {papers.scope === 'full-text' ? (
            <p className="faint" style={{ fontSize: 12.5, marginTop: 0 }}>
              {fullTextNote ?? 'Nothing names this gene in a title or abstract, so these are full-text matches.'}
            </p>
          ) : null}
          {extraTerms && !hideFilterNote ? (
            <p className="faint" style={{ fontSize: 12.5, marginTop: 0 }}>
              Filtered to papers that also mention “{extraTerms}”.
            </p>
          ) : null}
          <ul className="gene-papers">
            {papers.papers.map((paper) => (
              <PaperRow key={`${paper.source}-${paper.id}`} paper={paper} />
            ))}
          </ul>
        </>
      ) : (
        <p className="dim" style={{ fontSize: 13.5 }}>{empty ?? 'Nothing published names this gene yet.'}</p>
      )}
      <ElsewhereChips gene={gene} extraTerms={extraTerms} />
    </>
  );
}
