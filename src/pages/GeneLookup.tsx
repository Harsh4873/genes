import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Download,
  ExternalLink,
  Lock,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Unlock,
  X,
} from 'lucide-react';
import type { CategoryId, Dataset, Gene } from '../lib/types';
import { CATEGORIES, category } from '../lib/categories';
import { href, navigate, useRoute } from '../lib/router';
import { searchGenes } from '../lib/search';
import { loadSelection, unlockedSelection, type SelectionDataset } from '../lib/selection';
import { LockedError, passphraseStore } from '../lib/lockbox';
import { loadPortalEnrichment, type PortalGeneEnrichment } from '../lib/portalEnrichment';
import { geneLiterature, literatureCounts, type GeneLiterature, type Paper } from '../lib/literature';
import {
  SIGNAL_META,
  SIGNALS,
  csvOf,
  rankGenes,
  type RankedGene,
  type SignalId,
  type Weights,
} from '../lib/prioritize';
import { lookupStatePath, parseLookupState, type LookupState } from '../lib/lookupState';
import { EXTERNAL_LINKS } from '../lib/external';
import { CategoryTag, SectionTitle, SourceBadge } from '../components/common';

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
    void loadPortalEnrichment().then((map) => alive && setEnrichment(map));
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

  const hits = useMemo(() => (state.q ? searchGenes(dataset.genes, state.q, 12) : []), [dataset.genes, state.q]);
  const gene = state.gene ? dataset.byOrf.get(state.gene) ?? null : null;

  const ranked = useMemo(
    () =>
      rankGenes({
        genes: dataset.genes,
        selection: selection?.byOrf ?? null,
        enrichment,
        literature,
        weights: state.weights,
        pathways: state.pathways,
      }),
    [dataset.genes, selection, enrichment, literature, state.weights, state.pathways],
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
            then rank the whole genome by what makes a gene worth your time.
          </p>
        </div>
      </div>

      <div className="card card-pad lookup-search">
        <div className="search-input-wrap">
          <Search size={16} aria-hidden />
          <input
            value={state.q}
            onChange={(e) => set({ q: e.target.value, page: 0 })}
            placeholder="eccD3, Rv0205, alpha-mannosidase, type VII secretion…"
            aria-label="Search genes"
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
            Nothing in the catalog matches “{state.q}”.
          </p>
        ) : null}

        {hits.length ? (
          <div className="gene-hits">
            {hits.map((hit) => (
              <button
                key={hit.gene.orf}
                type="button"
                className="gene-hit"
                onClick={() => set({ gene: hit.gene.orf, q: '' })}
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
          selection={selection}
          enrichment={enrichment?.get(gene.orf) ?? null}
          onClose={() => set({ gene: '' })}
          onUnlocked={setSelection}
        />
      ) : null}

      <Prioritize
        ranked={ranked}
        state={state}
        selection={selection}
        onWeights={(weights) => set({ weights, page: 0 })}
        onPathways={(pathways) => set({ pathways, page: 0 })}
        onPage={(page) => set({ page })}
        onPick={(orf) => set({ gene: orf })}
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
            ω, DPD, allele counts and the branch-model likelihoods come from an unpublished study, so they ship
            encrypted. Everything else on this page works without the passphrase.
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

function GenePanel({
  gene,
  selection,
  enrichment,
  onClose,
  onUnlocked,
}: {
  gene: Gene;
  selection: SelectionDataset | null;
  enrichment: PortalGeneEnrichment | null;
  onClose: () => void;
  onUnlocked: (data: SelectionDataset) => void;
}) {
  const [papers, setPapers] = useState<GeneLiterature | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const row = selection?.byOrf.get(gene.orf) ?? null;

  useEffect(() => {
    const controller = new AbortController();
    setPapers(null);
    setError(null);
    setBusy(true);
    geneLiterature(gene, 25, controller.signal)
      .then(setPapers)
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [gene.orf]);

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
                href={link.href(gene.orf, gene.gene)}
                title={link.desc}
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
            aside={papers && papers.count > 0 ? <span className="pane-count">{papers.count.toLocaleString()}</span> : null}
          >
            Literature
          </SectionTitle>
          {busy ? (
            <p className="dim" style={{ fontSize: 13.5 }}>
              <RefreshCw size={13} className="spin" aria-hidden /> Searching Europe PMC…
            </p>
          ) : error ? (
            <p className="lock-error">{error}</p>
          ) : papers && papers.papers.length ? (
            <>
              {papers.scope === 'full-text' ? (
                <p className="faint" style={{ fontSize: 12.5, marginTop: 0 }}>
                  Nothing names this gene in a title or abstract, so these are full-text matches.
                </p>
              ) : null}
              <ul className="gene-papers">
                {papers.papers.map((paper) => (
                  <PaperRow key={paper.id} paper={paper} />
                ))}
              </ul>
            </>
          ) : (
            <p className="dim" style={{ fontSize: 13.5 }}>Nothing published names this gene yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function PaperRow({ paper }: { paper: Paper }) {
  return (
    <li className="gene-paper">
      <a className="gene-paper-title" href={paper.url} target="_blank" rel="noreferrer noopener">
        {paper.title}
      </a>
      <div className="gene-paper-meta">
        {paper.journal ? <span>{paper.journal}</span> : null}
        {paper.year ? <span>{paper.year}</span> : null}
        {paper.citedBy !== null ? <span>{paper.citedBy.toLocaleString()} citations</span> : null}
        {paper.isPreprint ? <span className="tag-preprint">Preprint</span> : null}
        {paper.isOpenAccess ? <span className="tag-open">Open access</span> : null}
      </div>
    </li>
  );
}

function Prioritize({
  ranked,
  state,
  selection,
  literature,
  onWeights,
  onPathways,
  onPage,
  onPick,
  onLiterature,
}: {
  ranked: RankedGene[];
  state: LookupState;
  selection: SelectionDataset | null;
  literature: Map<string, number>;
  onWeights: (weights: Weights) => void;
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
        <SlidersHorizontal size={15} aria-hidden /> GenePrioritize
      </SectionTitle>
      <p className="dim" style={{ marginTop: 0, fontSize: 13.5, maxWidth: '74ch' }}>
        Every signal is scaled to 0–1 and weighted by you; the score is the weighted mean over the signals that have
        data for that gene, so a gene is never punished for a measurement nobody made. Only measured quantities are
        used — the representative panels elsewhere in MtbScope are deliberately excluded.
      </p>

      <div className="weights">
        {SIGNAL_META.map((meta) => (
          <label key={meta.id} className="weight" title={meta.help}>
            <span>
              {meta.label}
              {meta.locked && !selection ? <Lock size={11} aria-label="locked" style={{ marginLeft: 5 }} /> : null}
            </span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.25}
              value={state.weights[meta.id]}
              onChange={(e) => onWeights({ ...state.weights, [meta.id]: Number(e.target.value) })}
            />
            <span className="tabnum">{state.weights[meta.id].toFixed(2)}</span>
          </label>
        ))}
      </div>

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
