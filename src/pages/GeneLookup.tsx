import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Download,
  ExternalLink,
  ListOrdered,
  Lock,
  RefreshCw,
  Search,
  Unlock,
  X,
} from 'lucide-react';
import type { CategoryId, Dataset, Gene } from '../lib/types';
import { CATEGORIES, category } from '../lib/categories';
import { href, navigate, useRoute } from '../lib/router';
import { searchGenesParsed } from '../lib/search';
import { loadSelection, unlockedSelection, type SelectionDataset } from '../lib/selection';
import { LockedError, passphraseStore } from '../lib/lockbox';
import { loadPortalEnrichment, type PortalGeneEnrichment } from '../lib/portalEnrichment';
import { geneLiterature, literatureCounts, termLiterature, type GeneLiterature, type LiteratureSort } from '../lib/literature';
import {
  SIGNAL_META,
  csvOf,
  rankGenes,
  type RankedGene,
  type SignalId,
} from '../lib/prioritize';
import { lookupStatePath, parseLookupState, type LookupState } from '../lib/lookupState';
import { EXTERNAL_LINKS } from '../lib/external';
import { CategoryTag, SectionTitle, SourceBadge } from '../components/common';
import { LiteratureSortToggles, PaperList, paperSetTabs, type PaperSetId } from '../components/Papers';

/** How many genes get a literature fetch when you ask for one. */
const SHORTLIST = 40;
const PAGE = 25;

export function GeneLookup({ dataset }: { dataset: Dataset }) {
  const route = useRoute();
  const state = useMemo(() => parseLookupState(route.params), [route.raw]);

  const [selection, setSelection] = useState<SelectionDataset | null>(unlockedSelection);
  const [enrichment, setEnrichment] = useState<Map<string, PortalGeneEnrichment> | null>(null);
  const [literature, setLiterature] = useState<Map<string, number>>(() => new Map());

  const set = (patch: Partial<LookupState>) => {
    navigate(lookupStatePath({ ...state, ...patch }));
  };

  useEffect(() => {
    let alive = true;
    void loadPortalEnrichment()
      .then((map) => alive && setEnrichment(map))
      .catch(() => {
        // Ranking still works without enrichment; gene pages surface the fetch error.
      });
    return () => {
      alive = false;
    };
  }, []);

  // A passphrase already used in this tab fills the locked signals in silently.
  useEffect(() => {
    if (selection) return;
    const remembered = passphraseStore.read();
    if (!remembered) return;
    loadSelection(remembered)
      .then(setSelection)
      .catch(() => passphraseStore.clear());
  }, []);

  const parsedSearch = useMemo(
    () => (state.q ? searchGenesParsed(dataset.genes, state.q, 12) : null),
    [dataset.genes, state.q],
  );
  const hits = parsedSearch?.hits ?? [];
  const typedExtra = parsedSearch?.parsed.extraTerms ?? '';
  const gene = state.gene ? dataset.byOrf.get(state.gene) ?? null : null;
  const extraTerms = (state.term || (!gene ? typedExtra : '')).trim();

  const ranked = useMemo(
    () =>
      rankGenes({
        genes: dataset.genes,
        selection: selection?.byOrf ?? null,
        enrichment,
        literature,
        pathways: state.pathways,
      }),
    [dataset.genes, selection, enrichment, literature, state.pathways],
  );

  return (
    <div className="container">
      <div className="lab-head">
        <div>
          <h1 style={{ fontSize: 25, display: 'flex', alignItems: 'center', gap: 9 }}>
            <BookOpen size={22} style={{ color: 'var(--accent)' }} aria-hidden /> GeneLookup
          </h1>
          <p className="dim" style={{ marginTop: 6, maxWidth: 720 }}>
            Look up any of the {dataset.count.toLocaleString()} H37Rv genes and read what has been published about it —
            then rank the whole genome by what makes a gene worth your time. Add a term after a gene
            (<span className="mono">Rv0001 rifampin</span>, <span className="mono">katG essential</span>) to filter papers.
          </p>
        </div>
      </div>

      <div className="card card-pad lookup-search">
        <div className="search-input-wrap">
          <Search size={16} aria-hidden />
          <input
            value={state.q}
            onChange={(e) => set({ q: e.target.value, page: 0 })}
            placeholder="Rv0001 rifampin, katG, PPE, essential…"
            aria-label="Search genes, optionally with an extra paper term"
            spellCheck={false}
          />
          {state.q ? (
            <button type="button" className="inline-clear" onClick={() => set({ q: '' })} aria-label="Clear search">
              <X size={15} />
            </button>
          ) : null}
        </div>

        {state.q && !hits.length ? (
          <p className="dim" style={{ margin: '10px 2px 0', fontSize: 13.5 }}>
            {typedExtra && !parsedSearch?.parsed.catalogQuery
              ? <>Nothing in the catalog is named “{state.q}”. Papers below are for that term in <i>M. tuberculosis</i>.</>
              : <>Nothing in the catalog matches “{state.q}”.</>}
          </p>
        ) : null}

        {typedExtra && hits.length ? (
          <p className="dim" style={{ margin: '10px 2px 0', fontSize: 13.5 }}>
            Showing genes for “{parsedSearch?.parsed.catalogQuery}”. Papers will include “{typedExtra}”.
          </p>
        ) : null}

        {hits.length ? (
          <div className="gene-hits">
            {hits.map((hit) => (
              <button
                key={hit.gene.orf}
                type="button"
                className="gene-hit"
                onClick={() => set({ gene: hit.gene.orf, term: typedExtra, q: '' })}
              >
                <span className="gene-hit-name">
                  <span className="mono">{hit.gene.orf}</span>
                  {hit.gene.gene ? <b>{hit.gene.gene}</b> : null}
                </span>
                <span className="gene-hit-annot">{hit.gene.annotation}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {gene ? (
        <GenePanel
          gene={gene}
          extraTerms={state.term}
          selection={selection}
          enrichment={enrichment?.get(gene.orf) ?? null}
          onClose={() => set({ gene: '', term: '' })}
          onUnlocked={setSelection}
        />
      ) : extraTerms && !hits.length ? (
        <TermPanel term={extraTerms} />
      ) : null}

      <Prioritize
        ranked={ranked}
        state={state}
        onPathways={(pathways) => set({ pathways, page: 0 })}
        onPage={(page) => set({ page })}
        onPick={(orf) => set({ gene: orf, term: extraTerms })}
        onLiterature={setLiterature}
        literature={literature}
      />
    </div>
  );
}

function SignalUnlock({ onUnlocked }: { onUnlocked: (data: SelectionDataset) => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="signal-unlock"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed || busy) return;
        setBusy(true);
        setError(null);
        loadSelection(trimmed)
          .then((data) => {
            passphraseStore.write(trimmed);
            onUnlocked(data);
          })
          .catch((err) => {
            if (err instanceof LockedError) passphraseStore.clear();
            setError(err instanceof Error ? err.message : String(err));
          })
          .finally(() => setBusy(false));
      }}
    >
      <div className="signal-unlock-head">
        <Lock size={14} aria-hidden />
        <span>
          <b>Unlock the selection dataset</b>
          <span>
            Selection signals need the Selection Lab passphrase. Everything else on this page works without it.
          </span>
        </span>
      </div>
      <div className="signal-unlock-row">
        <label className="sr-only" htmlFor="lookup-passphrase">Passphrase</label>
        <input
          id="lookup-passphrase"
          className="lock-input"
          type="password"
          autoComplete="current-password"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Passphrase"
          disabled={busy}
        />
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !value.trim()}>
          {busy ? <><RefreshCw size={14} className="spin" /> Deriving…</> : <><Unlock size={14} /> Unlock</>}
        </button>
      </div>
      {error ? <p className="lock-error">{error}</p> : null}
    </form>
  );
}

function fmt(value: number | null | undefined, digits: number): string {
  return value === null || value === undefined || Number.isNaN(value) ? '—' : value.toFixed(digits);
}

function TermPanel({ term }: { term: string }) {
  const [papers, setPapers] = useState<GeneLiterature | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<LiteratureSort>('relevance');

  useEffect(() => {
    const controller = new AbortController();
    setPapers(null);
    setError(null);
    setBusy(true);
    termLiterature(term, { limit: 25, sort, signal: controller.signal })
      .then(setPapers)
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [term, sort]);

  return (
    <section className="card card-pad gene-panel-card">
      <div className="gene-panel-head">
        <div>
          <h2>Papers for “{term}”</h2>
          <p className="dim">No catalog gene matched that token, so this is an organism-scoped literature search.</p>
        </div>
      </div>
      <LiteratureSortToggles value={sort} onChange={setSort} />
      <PaperList
        papers={papers}
        busy={busy}
        error={error}
        extraTerms={term}
        gene={null}
        empty={`No papers pairing “${term}” with tuberculosis / mycobacterium.`}
      />
    </section>
  );
}

interface PaperTrio {
  combined: GeneLiterature;
  gene: GeneLiterature;
  terms: GeneLiterature;
}

function GenePanel({
  gene,
  extraTerms,
  selection,
  enrichment,
  onClose,
  onUnlocked,
}: {
  gene: Gene;
  extraTerms: string;
  selection: SelectionDataset | null;
  enrichment: PortalGeneEnrichment | null;
  onClose: () => void;
  onUnlocked: (data: SelectionDataset) => void;
}) {
  const [papers, setPapers] = useState<GeneLiterature | null>(null);
  const [trio, setTrio] = useState<PaperTrio | null>(null);
  const [view, setView] = useState<PaperSetId>('combined');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<LiteratureSort>(extraTerms ? 'relevance' : 'cited');
  const row = selection?.byOrf.get(gene.orf) ?? null;
  const activeCount = extraTerms && trio ? trio[view].count : (papers?.count ?? 0);

  useEffect(() => {
    setSort(extraTerms ? 'relevance' : 'cited');
    setView('combined');
  }, [gene.orf, extraTerms]);

  useEffect(() => {
    const controller = new AbortController();
    setPapers(null);
    setTrio(null);
    setError(null);
    setBusy(true);
    const failed = (e: unknown) => {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
    };
    const done = () => {
      if (!controller.signal.aborted) setBusy(false);
    };
    if (!extraTerms) {
      geneLiterature(gene, { limit: 25, sort, signal: controller.signal }).then(setPapers, failed).finally(done);
    } else {
      void Promise.all([
        geneLiterature(gene, { limit: 25, extraTerms, sort, signal: controller.signal }),
        geneLiterature(gene, { limit: 25, sort, signal: controller.signal }),
        termLiterature(extraTerms, { limit: 25, sort, signal: controller.signal }),
      ])
        .then(([combined, geneOnly, termsOnly]) => {
          if (!controller.signal.aborted) setTrio({ combined, gene: geneOnly, terms: termsOnly });
        }, failed)
        .finally(done);
    }
    return () => controller.abort();
  }, [gene, extraTerms, sort]);

  return (
    <section className="card card-pad gene-panel-card">
      <div className="gene-panel-head">
        <div>
          <h2>
            <span className="mono">{gene.orf}</span>
            {gene.gene ? <span className="accent">{gene.gene}</span> : null}
          </h2>
          <p className="dim">{gene.annotation || 'No product description.'}</p>
          <div className="chip-row">
            <CategoryTag id={gene.category} />
            <span className="chip-static">{gene.length.toLocaleString()} aa</span>
            <span className="chip-static mono">
              {gene.strand}
              {Math.round(gene.start / 1000)}k
            </span>
            <a className="chip" href={href(`gene/${gene.orf}`)}>
              Full gene page
            </a>
            {extraTerms ? <span className="chip-static">papers + {extraTerms}</span> : null}
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close gene">
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="gene-panel-grid2">
        <div>
          <SectionTitle aside={<SourceBadge kind="study" compact />}>Selection in diabetes</SectionTitle>
          {row ? (
            <dl className="kv kv-selection">
              <dt>DPD</dt>
              <dd className="tabnum">{fmt(row.dpd, 4)}</dd>
              <dt>ω diabetes</dt>
              <dd className="tabnum">{fmt(row.omegaDb, 3)}</dd>
              <dt>ω non-diabetes</dt>
              <dd className="tabnum">{fmt(row.omegaNdb, 3)}</dd>
              <dt>Δlog₂(pN/pS)</dt>
              <dd className="tabnum">{fmt(row.publishedDeltaLog2, 3)}</dd>
              <dt>Distinct alleles</dt>
              <dd className="tabnum">{row.alleles ?? '—'}</dd>
              <dt>Branch model 2ΔlnL</dt>
              <dd className="tabnum">{fmt(row.pamlSigned2LL, 3)}</dd>
            </dl>
          ) : selection ? (
            <p className="dim" style={{ fontSize: 13.5 }}>This gene is not in the selection dataset.</p>
          ) : (
            <SignalUnlock onUnlocked={onUnlocked} />
          )}

          {enrichment?.pnps || enrichment?.omegaPeak !== undefined ? (
            <>
              <SectionTitle aside={<SourceBadge kind="reference" compact />}>Lineage selection</SectionTitle>
              <dl className="kv kv-lineage">
                <dt>pN/pS overall</dt>
                <dd className="tabnum">{fmt(enrichment.pnps?.overall, 3)}</dd>
                <dt>ω peak</dt>
                <dd className="tabnum">{fmt(enrichment.omegaPeak, 2)}</dd>
                <dt>Portal call</dt>
                <dd>{enrichment.underSelection ? 'Under selection' : 'Not flagged'}</dd>
              </dl>
            </>
          ) : null}

          <SectionTitle>Elsewhere</SectionTitle>
          <div className="gene-links">
            {EXTERNAL_LINKS.map((link) => (
              <a
                key={link.id}
                className="chip"
                href={link.href(gene)}
                title={link.note?.(gene) ?? link.desc}
                target="_blank"
                rel="noreferrer noopener"
              >
                {link.label} <ExternalLink size={12} aria-hidden />
              </a>
            ))}
            <a className="chip" href={href(`selection?gene=${gene.orf}`)}>
              Selection Lab
            </a>
          </div>
        </div>

        <div>
          <SectionTitle
            aside={activeCount > 0 ? <span className="pane-count">{activeCount.toLocaleString()}</span> : null}
          >
            Literature
          </SectionTitle>
          <LiteratureSortToggles value={sort} onChange={setSort} />
          {extraTerms && trio ? (
            <>
              <div className="chip-row" role="group" aria-label="Paper sets">
                {paperSetTabs(gene.gene ?? gene.orf, extraTerms, {
                  combined: trio.combined.count,
                  gene: trio.gene.count,
                  terms: trio.terms.count,
                }).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`chip${view === tab.id ? ' on' : ''}`}
                    aria-pressed={view === tab.id}
                    onClick={() => setView(tab.id)}
                  >
                    {tab.label} <span className="tabnum">{tab.count.toLocaleString()}</span>
                  </button>
                ))}
              </div>
              <PaperList
                papers={trio[view]}
                busy={busy}
                error={error}
                extraTerms={view === 'gene' ? undefined : extraTerms}
                gene={view === 'terms' ? null : gene}
                empty={
                  view === 'combined'
                    ? `No papers pair ${gene.gene ?? gene.orf} with “${extraTerms}”.`
                    : view === 'terms'
                      ? `No papers pairing “${extraTerms}” with tuberculosis / mycobacterium.`
                      : undefined
                }
                fullTextNote={
                  view === 'terms'
                    ? `Nothing names “${extraTerms}” in a title or abstract, so these are full-text matches.`
                    : undefined
                }
                hideFilterNote={view === 'terms'}
              />
            </>
          ) : (
            <PaperList
              papers={papers}
              busy={busy}
              error={error}
              extraTerms={extraTerms}
              gene={gene}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function Prioritize({
  ranked,
  state,
  literature,
  onPathways,
  onPage,
  onPick,
  onLiterature,
}: {
  ranked: RankedGene[];
  state: LookupState;
  literature: Map<string, number>;
  onPathways: (pathways: CategoryId[]) => void;
  onPage: (page: number) => void;
  onPick: (orf: string) => void;
  onLiterature: (counts: Map<string, number>) => void;
}) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const pages = Math.max(1, Math.ceil(ranked.length / PAGE));
  const page = Math.min(state.page, pages - 1);
  const shown = ranked.slice(page * PAGE, page * PAGE + PAGE);

  const pending = ranked.slice(0, SHORTLIST).filter((r) => !literature.has(r.gene.orf)).map((r) => r.gene);

  const fetchLiterature = () => {
    if (progress || !pending.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ done: 0, total: pending.length });
    void literatureCounts(pending, {
      signal: controller.signal,
      onProgress: (done, total) => setProgress({ done, total }),
    })
      .then((counts) => {
        if (controller.signal.aborted) return;
        const merged = new Map(literature);
        for (const [orf, count] of counts) merged.set(orf, count);
        onLiterature(merged);
      })
      .finally(() => {
        if (!controller.signal.aborted) setProgress(null);
      });
  };

  const download = () => {
    const blob = new Blob([csvOf(ranked)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'geneprioritize.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="card card-pad prioritize">
      <SectionTitle
        aside={
          <button type="button" className="btn btn-sm" onClick={download}>
            <Download size={14} aria-hidden /> CSV
          </button>
        }
      >
        <ListOrdered size={15} aria-hidden /> GenePrioritize
      </SectionTitle>
      <p className="dim" style={{ marginTop: 0, fontSize: 13.5, maxWidth: '74ch' }}>
        Every signal is scaled to 0–1 and combined with fixed default weights; the score is the weighted mean over the
        signals that have data for that gene, so a gene is never punished for a measurement nobody made.
      </p>

      <div className="chip-row">
        <span className="dim" style={{ fontSize: 12.5 }}>Pathways of interest:</span>
        {CATEGORIES.filter((c) => c.id !== 'unclassified').map((meta) => {
          const on = state.pathways.includes(meta.id);
          return (
            <button
              key={meta.id}
              type="button"
              className={`chip${on ? ' on' : ''}`}
              aria-pressed={on}
              onClick={() => onPathways(on ? state.pathways.filter((c) => c !== meta.id) : [...state.pathways, meta.id])}
            >
              {meta.short}
            </button>
          );
        })}
      </div>

      <div className="chip-row">
        <button type="button" className="btn btn-sm" onClick={fetchLiterature} disabled={progress !== null || !pending.length}>
          {progress ? (
            <><RefreshCw size={14} className="spin" aria-hidden /> {progress.done}/{progress.total}</>
          ) : (
            <><BookOpen size={14} aria-hidden /> Fetch literature for the top {SHORTLIST}</>
          )}
        </button>
        <span className="dim" style={{ fontSize: 12.5 }}>
          {pending.length
            ? 'Counts are fetched for the current top of the ranking, not the whole genome.'
            : `Literature counted for the top ${SHORTLIST}.`}
        </span>
      </div>

      <div className="table-wrap">
        <table className="table gene-rank-table">
          <thead>
            <tr>
              <th style={{ width: 46 }}>#</th>
              <th>Gene</th>
              <th>Product</th>
              <th style={{ width: 150 }}>Score</th>
              <th style={{ width: 150 }}>Signals</th>
              {/* ω is not uppercased with the rest of the header: uppercase ω is Ω, a different quantity. */}
              <th style={{ textAlign: 'right', textTransform: 'none' }}>ω DB</th>
              <th style={{ textAlign: 'right' }}>DPD</th>
              <th style={{ textAlign: 'right' }}>Alleles</th>
              <th style={{ textAlign: 'right' }}>Papers</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <RankRow key={row.gene.orf} row={row} rank={page * PAGE + i + 1} onPick={onPick} />
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <div className="pagerow">
          <button type="button" className="btn btn-sm" onClick={() => onPage(page - 1)} disabled={page === 0}>
            Previous
          </button>
          <span className="dim tabnum" style={{ fontSize: 13.5 }}>
            Page {page + 1} of {pages}
          </span>
          <button type="button" className="btn btn-sm" onClick={() => onPage(page + 1)} disabled={page >= pages - 1}>
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}

const SHORT: Record<SignalId, string> = Object.fromEntries(
  SIGNAL_META.map((m) => [m.id, m.short]),
) as Record<SignalId, string>;

function RankRow({ row, rank, onPick }: { row: RankedGene; rank: number; onPick: (orf: string) => void }) {
  return (
    <tr onClick={() => onPick(row.gene.orf)} className="rank-row">
      <td className="tabnum dim">{rank}</td>
      <td>
        <span className="mono">{row.gene.orf}</span>
        {row.gene.gene ? <b className="accent" style={{ marginLeft: 6 }}>{row.gene.gene}</b> : null}
      </td>
      <td className="dim rank-product" title={row.gene.annotation}>{row.gene.annotation}</td>
      <td>
        <span className="score-bar" style={{ '--v': `${row.score}%` } as React.CSSProperties} aria-hidden />
        <span className="tabnum dim" style={{ fontSize: 11.5 }}>{row.score.toFixed(1)}</span>
      </td>
      <td>
        <span className="signal-pips">
          {row.signals.map((signal) => (
            <span
              key={signal.id}
              className={`signal-pip${signal.value === null ? ' signal-pip-missing' : ''}`}
              title={
                signal.value === null
                  ? `${SHORT[signal.id]}: not measured for this gene`
                  : `${SHORT[signal.id]}: ${signal.value.toFixed(2)}`
              }
            >
              <i style={{ height: `${signal.value === null ? 0 : Math.max(6, signal.value * 100)}%` }} />
              <em>{SHORT[signal.id]}</em>
            </span>
          ))}
        </span>
      </td>
      <td className="tabnum" style={{ textAlign: 'right' }}>{fmt(row.selection?.omegaDb ?? null, 2)}</td>
      <td className="tabnum" style={{ textAlign: 'right' }}>{fmt(row.selection?.dpd ?? null, 3)}</td>
      <td className="tabnum" style={{ textAlign: 'right' }}>{row.selection?.alleles ?? '—'}</td>
      <td className="tabnum" style={{ textAlign: 'right' }}>{row.literature === null ? '—' : row.literature.toLocaleString()}</td>
    </tr>
  );
}
