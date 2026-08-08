import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Beaker,
  Check,
  Download,
  ExternalLink,
  FlaskConical,
  Lock,
  RefreshCw,
  Search,
  TriangleAlert,
  Unlock,
  X,
} from 'lucide-react';
import type { Dataset } from '../lib/types';
import {
  loadSelection,
  resetSelectionCache,
  unlockedSelection,
  type SelectionDataset,
  type SelectionGene,
} from '../lib/selection';
import { LockedError, passphraseStore } from '../lib/lockbox';
import {
  LRT_CRITICAL_05,
  PUBLISHED_THRESHOLDS,
  chiSquareP,
  geneStats,
  methodAgreement,
  pearsonChiSquare,
  pnpsPair,
  positiveCriteria,
  purifyingCriteria,
  reproduction,
  selectionCall,
  type SelectionCall,
} from '../lib/selectionStats';
import {
  DEFAULT_SELECTION_STATE,
  parseSelectionState,
  selectionStatePath,
  thresholdsOf,
  type SelectionSortKey,
  type SelectionState,
} from '../lib/selectionState';
import { href, replaceRoute, useRoute } from '../lib/router';
import { fmtInt } from '../lib/format';
import { Provenance, SectionTitle, SourceBadge } from '../components/common';
import { CohortBar, OmegaIntervals, SelectionScatter, buildPlot } from '../components/SelectionCharts';

const PAGE = 40;

function fmt(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

function fmtP(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value < 0.0001) return value.toExponential(1);
  return value.toFixed(4);
}

const CALL_LABEL: Record<SelectionCall, string> = {
  positive: 'Positive in diabetes',
  purifying: 'Purifying in diabetes',
  none: 'Not called',
};

function CallTag({ call }: { call: SelectionCall }) {
  if (call === 'none') return <span className="faint">—</span>;
  return <span className={`call-tag call-${call}`}>{CALL_LABEL[call]}</span>;
}

interface FilterStep {
  label: string;
  remaining: number;
}

/** The filter chain, kept as a list of steps so the page can show the attrition. */
function runFilters(dataset: SelectionDataset, state: SelectionState, catalog: Dataset) {
  const thresholds = thresholdsOf(state);
  const calls = new Map<string, SelectionCall>();
  for (const gene of dataset.genes) calls.set(gene.orf, selectionCall(gene, thresholds));

  const steps: FilterStep[] = [];
  let list = dataset.genes;
  steps.push({ label: `${fmtInt(dataset.count)} genes in the genome`, remaining: list.length });

  if (state.noRepeat) {
    list = list.filter((gene) => !gene.repetitive);
    steps.push({ label: 'excluding PE / PPE / PE_PGRS', remaining: list.length });
  }

  if (state.dir === 'positive') {
    list = list.filter((gene) => gene.dpd !== null && gene.dpd > state.dpdHigh);
    steps.push({ label: `DPD > ${state.dpdHigh}`, remaining: list.length });
    list = list.filter((gene) => gene.omegaDb !== null && gene.omegaDb > state.omegaMin);
    steps.push({ label: `posterior mean ωDB > ${state.omegaMin}`, remaining: list.length });
    list = list.filter((gene) => gene.alleles !== null && gene.alleles >= state.allelesPositive);
    steps.push({ label: `at least ${state.allelesPositive} distinct alleles`, remaining: list.length });
  } else if (state.dir === 'purifying') {
    list = list.filter((gene) => gene.dpd !== null && gene.dpd < state.dpdLow);
    steps.push({ label: `DPD < ${state.dpdLow}`, remaining: list.length });
    list = list.filter((gene) => gene.omegaDbHi !== null && gene.omegaDbHi < 1);
    steps.push({ label: '95% CI for ωDB entirely below 1', remaining: list.length });
    list = list.filter(
      (gene) => gene.omegaNdbLo !== null && gene.omegaNdbHi !== null && gene.omegaNdbLo <= 1 && gene.omegaNdbHi >= 1,
    );
    steps.push({ label: '95% CI for ωNDB spans 1', remaining: list.length });
    list = list.filter((gene) => gene.alleles !== null && gene.alleles >= state.allelesPurifying);
    steps.push({ label: `at least ${state.allelesPurifying} distinct alleles`, remaining: list.length });
  }

  if (state.chi) {
    list = list.filter((gene) => {
      const chi = gene.counts ? pearsonChiSquare(gene.counts) : null;
      return chi !== null && chiSquareP(chi) < 0.05;
    });
    steps.push({ label: 'χ² on the same counts, P < 0.05', remaining: list.length });
  }

  if (state.lrt) {
    list = list.filter((gene) => gene.pamlFitted && Math.abs(gene.pamlSigned2LL ?? 0) > LRT_CRITICAL_05);
    steps.push({ label: 'branch model M2 vs M0, 2ΔLL > 3.84', remaining: list.length });
  }

  const terms = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length) {
    list = list.filter((gene) => {
      const annotation = catalog.byOrf.get(gene.orf)?.annotation ?? '';
      const hay = `${gene.orf} ${gene.gene ?? ''} ${annotation}`.toLowerCase();
      return terms.every((term) => hay.includes(term));
    });
    steps.push({ label: `matching “${state.q.trim()}”`, remaining: list.length });
  }

  return { list, steps, calls };
}

function sortGenes(list: SelectionGene[], key: SelectionSortKey, direction: number): SelectionGene[] {
  const value = (gene: SelectionGene): number | string => {
    switch (key) {
      case 'orf':
        return gene.orf;
      case 'gene':
        return gene.gene ?? 'zzzz';
      case 'omegaDb':
        return gene.omegaDb ?? -Infinity;
      case 'omegaNdb':
        return gene.omegaNdb ?? -Infinity;
      case 'delta':
        return pnpsPair(gene)?.deltaLog2 ?? -Infinity;
      case 'alleles':
        return gene.alleles ?? -Infinity;
      case 'chi':
        return gene.counts ? (pearsonChiSquare(gene.counts) ?? -Infinity) : -Infinity;
      case 'lrt':
        return gene.pamlFitted ? gene.pamlSigned2LL ?? -Infinity : -Infinity;
      default:
        return gene.dpd ?? -Infinity;
    }
  };
  return [...list].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    const cmp =
      typeof va === 'string' || typeof vb === 'string'
        ? String(va).localeCompare(String(vb), undefined, { numeric: true })
        : va - vb;
    return cmp * direction || a.orf.localeCompare(b.orf, undefined, { numeric: true });
  });
}

function toCsv(genes: SelectionGene[], catalog: Dataset, calls: Map<string, SelectionCall>): string {
  const header = [
    'orf', 'gene', 'product', 'codons', 'family', 'call',
    'dpd', 'dpd_rank', 'omega_db', 'omega_db_ci2.5', 'omega_db_ci97.5',
    'omega_ndb', 'omega_ndb_ci2.5', 'omega_ndb_ci97.5',
    'db_nsyn', 'db_syn', 'ndb_nsyn', 'ndb_syn', 'possible_nsyn_sites', 'possible_syn_sites',
    'pnps_db', 'pnps_ndb', 'delta_log2_pnps', 'distinct_alleles',
    'chi_square', 'chi_square_p', 'paml_status', 'paml_omega_db', 'paml_omega_ndb',
    'paml_signed_2dll', 'paml_p', 'paml_haplotypes',
  ];
  const cell = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [header.join(',')];
  for (const gene of genes) {
    const stats = geneStats(gene);
    lines.push(
      [
        gene.orf, gene.gene ?? '', catalog.byOrf.get(gene.orf)?.annotation ?? '', gene.codons, gene.family ?? '',
        calls.get(gene.orf) ?? 'none',
        gene.dpd, gene.dpdRank, gene.omegaDb, gene.omegaDbLo, gene.omegaDbHi,
        gene.omegaNdb, gene.omegaNdbLo, gene.omegaNdbHi,
        gene.counts?.dbNsyn, gene.counts?.dbSyn, gene.counts?.ndbNsyn, gene.counts?.ndbSyn,
        gene.nsynSites, gene.synSites,
        stats.pnps ? stats.pnps.db.toFixed(4) : '', stats.pnps ? stats.pnps.ndb.toFixed(4) : '',
        stats.pnps ? stats.pnps.deltaLog2.toFixed(4) : '', gene.alleles,
        stats.chiSq?.toFixed(4), stats.chiSqP?.toExponential(3),
        gene.pamlStatus ?? '', gene.pamlOmegaDb, gene.pamlOmegaNdb,
        gene.pamlSigned2LL, stats.lrtP?.toExponential(3), gene.pamlHaplotypes,
      ].map(cell).join(','),
    );
  }
  return lines.join('\n');
}

function LockScreen({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (passphrase: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="container" style={{ maxWidth: 560 }}>
      <form
        className="card card-pad lock-card"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value);
        }}
      >
        <div className="lock-icon" aria-hidden>
          <Lock size={22} />
        </div>
        <h1 style={{ fontSize: 21 }}>Selection Lab</h1>
        <p className="dim" style={{ fontSize: 14, marginTop: 8 }}>
          This dataset is unpublished, so it is published encrypted. The passphrase derives the key on this device and
          decrypts it here; nothing is sent anywhere, and without it the file is just ciphertext.
        </p>
        <label className="sr-only" htmlFor="selection-passphrase">Passphrase</label>
        <input
          id="selection-passphrase"
          className="lock-input"
          type="password"
          autoComplete="current-password"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Passphrase"
          disabled={busy}
          autoFocus
        />
        {error ? <p className="lock-error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy || !value.trim()} style={{ width: '100%' }}>
          {busy ? <><RefreshCw size={15} className="spin" /> Deriving the key…</> : <><Unlock size={15} /> Unlock</>}
        </button>
        <p className="faint" style={{ fontSize: 12, marginBottom: 0, marginTop: 12 }}>
          Key derivation is PBKDF2-SHA256 over 600,000 iterations, so unlocking takes a moment. The rest of MtbScope needs
          no passphrase.
        </p>
      </form>
    </div>
  );
}

export function SelectionLab({ dataset }: { dataset: Dataset }) {
  const route = useRoute();
  const state = useMemo(() => parseSelectionState(route.params), [route.raw]);
  const [selection, setSelection] = useState<SelectionDataset | null>(unlockedSelection);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const attempt = (passphrase: string, remember: boolean) => {
    const trimmed = passphrase.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    loadSelection(trimmed)
      .then((unlockedDataset) => {
        setSelection(unlockedDataset);
        if (remember) passphraseStore.write(trimmed);
      })
      .catch((e) => {
        if (e instanceof LockedError) passphraseStore.clear();
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setBusy(false));
  };

  // A passphrase already used in this tab reopens the Lab without a prompt.
  useEffect(() => {
    if (selection) return;
    const remembered = passphraseStore.read();
    if (remembered) attempt(remembered, false);
  }, []);

  const lock = () => {
    passphraseStore.clear();
    resetSelectionCache();
    setSelection(null);
    setError(null);
  };

  const update = (patch: Partial<SelectionState>, resetPage = true) => {
    replaceRoute(selectionStatePath({ ...state, ...patch, page: resetPage ? 0 : patch.page ?? state.page }));
  };

  const result = useMemo(
    () => (selection ? runFilters(selection, state, dataset) : null),
    [selection, state, dataset],
  );
  const sorted = useMemo(
    () => (result ? sortGenes(result.list, state.sort, state.sortDir) : []),
    [result, state.sort, state.sortDir],
  );
  const plot = useMemo(
    () =>
      selection && result
        ? buildPlot(selection.genes, result.calls, state.plot, { dpdHigh: state.dpdHigh, dpdLow: state.dpdLow })
        : null,
    [selection, result, state.plot, state.dpdHigh, state.dpdLow],
  );
  const agreement = useMemo(() => (selection ? methodAgreement(selection.genes) : null), [selection]);
  const informative = useMemo(() => (selection ? methodAgreement(selection.genes, 15) : null), [selection]);
  const check = useMemo(() => (selection ? reproduction(selection.genes) : null), [selection]);

  if (!selection || !result || !plot) {
    return <LockScreen busy={busy} error={error} onSubmit={(passphrase) => attempt(passphrase, true)} />;
  }

  const { metadata } = selection;
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const page = Math.min(state.page, pages - 1);
  const pageItems = sorted.slice(page * PAGE, page * PAGE + PAGE);
  const focus = state.gene ? selection.byOrf.get(state.gene) ?? null : null;
  const called = new Set(result.list.map((gene) => gene.orf));

  const downloadCsv = () => {
    const blob = new Blob([toCsv(sorted, dataset, result.calls)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mtbscope-selection-${state.dir}-${sorted.length}-genes.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const sortIcon = (key: SelectionSortKey) =>
    state.sort !== key ? (
      <ArrowUpDown size={12} style={{ opacity: 0.4 }} />
    ) : state.sortDir === 1 ? (
      <ArrowUp size={12} className="arrow" />
    ) : (
      <ArrowDown size={12} className="arrow" />
    );

  const SortHeader = ({ label, sortKey, hint }: { label: string; sortKey: SelectionSortKey; hint?: string }) => (
    <th
      aria-sort={state.sort === sortKey ? (state.sortDir === 1 ? 'ascending' : 'descending') : 'none'}
      title={hint}
    >
      <button
        className="th-sort"
        type="button"
        onClick={() =>
          update(state.sort === sortKey ? { sortDir: state.sortDir === 1 ? -1 : 1 } : { sort: sortKey, sortDir: -1 })
        }
      >
        <span>{label}</span>
        {sortIcon(sortKey)}
      </button>
    </th>
  );

  return (
    <div className="container wide">
      <div className="lab-head">
        <div>
          <h1 style={{ fontSize: 25, display: 'flex', alignItems: 'center', gap: 9 }}>
            <FlaskConical size={22} style={{ color: 'var(--accent)' }} /> Selection Lab
          </h1>
          <p className="dim" style={{ marginTop: 6, maxWidth: 720 }}>
            Gene-by-gene comparison of selection pressure in <b>M. tuberculosis</b> isolates from TB patients with and
            without diabetes: a Bayesian posterior comparison, a count-based pN/pS comparison, and a phylogenetic
            likelihood-ratio test, over all {fmtInt(selection.count)} annotated genes.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <SourceBadge kind="study" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={lock} title="Forget the passphrase in this tab">
            <Lock size={14} /> Lock
          </button>
        </div>
      </div>

      <div className="unpublished-note">
        <TriangleAlert size={15} style={{ flex: 'none', marginTop: 2 }} />
        <div>
          <b>Unpublished.</b> {metadata.study.note}
        </div>
      </div>

      <div className="stat-row" style={{ marginTop: 16 }}>
        <div className="stat">
          <div className="num tabnum">{fmtInt(metadata.cohorts.total)}</div>
          <div className="lab">isolates ({fmtInt(metadata.cohorts.db)} diabetes, {fmtInt(metadata.cohorts.ndb)} without)</div>
        </div>
        <div className="stat">
          <div className="num tabnum">{fmtInt(selection.count)}</div>
          <div className="lab">genes with a posterior for ω in both cohorts</div>
        </div>
        <div className="stat">
          <div className="num tabnum">{fmtInt(selection.fitted)}</div>
          <div className="lab">genes the branch model could fit</div>
        </div>
        <div className="stat">
          <div className="num tabnum">{fmtInt(result.list.length)}</div>
          <div className="lab">
            {state.dir === 'all' ? 'genes in the current view' : `called ${state.dir} at these thresholds`}
          </div>
        </div>
      </div>

      <SectionTitle>The collection</SectionTitle>
      <div className="card card-pad cohort-card">
        <p className="dim" style={{ marginTop: 0, fontSize: 13.5 }}>
          {metadata.cohorts.sources}. {metadata.cohorts.filters}
        </p>
        <div className="cohort-grid">
          {['study', 'country', 'lineage', 'resistance'].map((facet) => (
            <div key={facet}>
              <h4 className="cohort-facet">{facet}</h4>
              {metadata.composition
                .filter((row) => row.facet === facet)
                .map((row) => (
                  <div key={row.group} className="cohort-row">
                    <span className="cohort-label">{row.group}</span>
                    <CohortBar db={row.db} ndb={row.ndb} />
                    <span className="cohort-count tabnum">{fmtInt(row.db + row.ndb)}</span>
                  </div>
                ))}
            </div>
          ))}
        </div>
        <div className="cohort-key">
          <span><i style={{ background: 'var(--danger)' }} /> diabetes</span>
          <span><i style={{ background: 'var(--info)' }} /> non-diabetes</span>
        </div>
      </div>

      <SectionTitle aside={<span className="dim" style={{ fontSize: 12.5 }}>every threshold is live</span>}>
        Significance filter
      </SectionTitle>
      <div className="card card-pad">
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <div className="segmented" aria-label="Direction of selection">
            {(['positive', 'purifying', 'all'] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                className={`segmented-item${state.dir === dir ? ' on' : ''}`}
                aria-pressed={state.dir === dir}
                onClick={() => update({ dir })}
              >
                {dir === 'positive' ? 'Positive in diabetes' : dir === 'purifying' ? 'Purifying in diabetes' : 'All genes'}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => update({ ...PUBLISHED_THRESHOLDS, chi: false, lrt: false, noRepeat: false, q: '' })}
            title="Restore the criteria the study applies"
          >
            <Beaker size={14} /> Published criteria
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ ...DEFAULT_SELECTION_STATE, gene: state.gene })}>
            <X size={14} /> Reset
          </button>
        </div>

        <div className="threshold-grid">
          {state.dir !== 'purifying' ? (
            <label className="threshold">
              <span>DPD above</span>
              <input
                type="range"
                min={0.5}
                max={0.999}
                step={0.001}
                value={state.dpdHigh}
                onChange={(e) => update({ dpdHigh: Number(e.target.value) })}
                aria-label="DPD lower cutoff"
              />
              <b className="tabnum">{state.dpdHigh.toFixed(3)}</b>
            </label>
          ) : (
            <label className="threshold">
              <span>DPD below</span>
              <input
                type="range"
                min={0.001}
                max={0.5}
                step={0.001}
                value={state.dpdLow}
                onChange={(e) => update({ dpdLow: Number(e.target.value) })}
                aria-label="DPD upper cutoff"
              />
              <b className="tabnum">{state.dpdLow.toFixed(3)}</b>
            </label>
          )}
          {state.dir === 'positive' ? (
            <label className="threshold">
              <span>ωDB above</span>
              <input
                type="range"
                min={0}
                max={3}
                step={0.05}
                value={state.omegaMin}
                onChange={(e) => update({ omegaMin: Number(e.target.value) })}
                aria-label="Minimum posterior mean omega in the diabetes cohort"
              />
              <b className="tabnum">{state.omegaMin.toFixed(2)}</b>
            </label>
          ) : null}
          <label className="threshold">
            <span>Distinct alleles</span>
            <input
              type="range"
              min={0}
              max={60}
              step={1}
              value={state.dir === 'purifying' ? state.allelesPurifying : state.allelesPositive}
              onChange={(e) =>
                update(
                  state.dir === 'purifying'
                    ? { allelesPurifying: Number(e.target.value) }
                    : { allelesPositive: Number(e.target.value) },
                )
              }
              aria-label="Minimum distinct alleles"
            />
            <b className="tabnum">{state.dir === 'purifying' ? state.allelesPurifying : state.allelesPositive}</b>
          </label>
        </div>

        <div className="filter-scroll" style={{ marginTop: 4 }}>
          <button type="button" className={`chip${state.chi ? ' on' : ''}`} aria-pressed={state.chi} onClick={() => update({ chi: !state.chi })}>
            {state.chi ? <Check size={13} /> : null} χ² P &lt; 0.05
          </button>
          <button type="button" className={`chip${state.lrt ? ' on' : ''}`} aria-pressed={state.lrt} onClick={() => update({ lrt: !state.lrt })}>
            {state.lrt ? <Check size={13} /> : null} branch model 2ΔLL &gt; 3.84
          </button>
          <button
            type="button"
            className={`chip${state.noRepeat ? ' on' : ''}`}
            aria-pressed={state.noRepeat}
            onClick={() => update({ noRepeat: !state.noRepeat })}
          >
            {state.noRepeat ? <Check size={13} /> : null} exclude PE / PPE
          </button>
        </div>

        <ol className="filter-chain">
          {result.steps.map((step, index) => (
            <li key={step.label}>
              <span className="chain-label">{step.label}</span>
              <span className="chain-count tabnum">{fmtInt(step.remaining)}</span>
              {index > 0 ? (
                <span className="chain-drop tabnum">−{fmtInt(result.steps[index - 1].remaining - step.remaining)}</span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      <SectionTitle
        aside={
          <div className="segmented" aria-label="Plot">
            {([
              ['dpd-delta', 'DPD vs Δlog₂'],
              ['lrt-dpd', '2ΔLL vs DPD'],
              ['omega', 'ω vs ω'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`segmented-item${state.plot === id ? ' on' : ''}`}
                aria-pressed={state.plot === id}
                onClick={() => update({ plot: id }, false)}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        Genome-wide view
      </SectionTitle>
      <div className="card card-pad">
        <SelectionScatter spec={plot} focus={focus?.orf ?? null} onPick={(orf) => update({ gene: orf }, false)} labelled={called} />
      </div>

      {focus ? <GenePanel gene={focus} catalog={dataset} selection={selection} onClose={() => update({ gene: '' }, false)} /> : null}

      <SectionTitle
        aside={
          <button type="button" className="btn btn-ghost btn-sm" onClick={downloadCsv} title="Download the current view">
            <Download size={14} /> CSV
          </button>
        }
      >
        {fmtInt(sorted.length)} gene{sorted.length === 1 ? '' : 's'}
      </SectionTitle>

      <div className="toolbar">
        <div className="search" style={{ maxWidth: 380, flex: 1 }}>
          <div className="search-input-wrap">
            <Search size={16} style={{ color: 'var(--text-faint)' }} />
            <input
              value={state.q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="Filter by Rv id, symbol or product..."
              spellCheck={false}
              aria-label="Filter selection results"
            />
            {state.q ? (
              <button type="button" className="inline-clear" onClick={() => update({ q: '' })} aria-label="Clear filter">
                <X size={15} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table selection-table">
          <thead>
            <tr>
              <SortHeader label="ORF" sortKey="orf" />
              <SortHeader label="Gene" sortKey="gene" />
              <SortHeader label="DPD" sortKey="dpd" hint="P(omega_DB > omega_NDB) from the posterior samples" />
              <SortHeader label="ωDB" sortKey="omegaDb" hint="Posterior mean with 95% credible interval" />
              <SortHeader label="ωNDB" sortKey="omegaNdb" />
              <SortHeader label="Δlog₂" sortKey="delta" hint="Difference of log2 pN/pS, recomputed from the counts" />
              <SortHeader label="Alleles" sortKey="alleles" />
              <SortHeader label="χ² P" sortKey="chi" />
              <SortHeader label="2ΔLL" sortKey="lrt" hint="Signed likelihood-ratio statistic, M2 against M0" />
              <th className="no-sort">Call</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((gene) => {
              const stats = geneStats(gene, thresholdsOf(state));
              return (
                <tr
                  key={gene.orf}
                  className={gene.orf === focus?.orf ? 'row-focus' : undefined}
                  onClick={() => update({ gene: gene.orf }, false)}
                >
                  <td>
                    <button type="button" className="row-link mono link-button">{gene.orf}</button>
                  </td>
                  <td>{gene.gene ? <span className="accent" style={{ fontWeight: 600 }}>{gene.gene}</span> : <span className="faint">-</span>}</td>
                  <td className="tabnum">{fmt(gene.dpd, 4)}</td>
                  <td className="tabnum">
                    {fmt(gene.omegaDb, 2)}
                    <span className="ci"> [{fmt(gene.omegaDbLo, 2)}–{fmt(gene.omegaDbHi, 2)}]</span>
                  </td>
                  <td className="tabnum">
                    {fmt(gene.omegaNdb, 2)}
                    <span className="ci"> [{fmt(gene.omegaNdbLo, 2)}–{fmt(gene.omegaNdbHi, 2)}]</span>
                  </td>
                  <td className="tabnum">{fmt(stats.pnps?.deltaLog2 ?? null, 2)}</td>
                  <td className="tabnum">{gene.alleles ?? '—'}</td>
                  <td className="tabnum">{fmtP(stats.chiSqP)}</td>
                  <td className="tabnum">{gene.pamlFitted ? fmt(gene.pamlSigned2LL, 2) : <span className="faint">—</span>}</td>
                  <td><CallTag call={result.calls.get(gene.orf) ?? 'none'} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!pageItems.length ? <div className="empty-state">No genes survive this filter chain.</div> : null}
      </div>

      {pages > 1 ? (
        <div className="pagerow">
          <button className="btn btn-sm" disabled={page === 0} onClick={() => update({ page: Math.max(0, page - 1) }, false)}>
            Previous
          </button>
          <span className="dim tabnum" style={{ fontSize: 13.5 }}>Page {page + 1} of {pages}</span>
          <button className="btn btn-sm" disabled={page >= pages - 1} onClick={() => update({ page: Math.min(pages - 1, page + 1) }, false)}>
            Next
          </button>
        </div>
      ) : null}

      <SectionTitle>How the methods agree</SectionTitle>
      <div className="card card-pad">
        <div className="stat-row">
          <div className="stat">
            <div className="num tabnum">{fmt(agreement?.dpdVsDeltaLog2 ?? null, 2)}</div>
            <div className="lab">Spearman ρ, DPD against Δlog₂(pN/pS), all {fmtInt(agreement?.n ?? 0)} genes</div>
          </div>
          <div className="stat">
            <div className="num tabnum">{fmt(informative?.dpdVsDeltaLog2 ?? null, 2)}</div>
            <div className="lab">the same, over the {fmtInt(informative?.n ?? 0)} genes with 15 or more alleles</div>
          </div>
          <div className="stat">
            <div className="num tabnum">{fmt(agreement?.dpdVsLrt ?? null, 2)}</div>
            <div className="lab">DPD against signed 2ΔLL, {fmtInt(agreement?.lrtN ?? 0)} fitted genes</div>
          </div>
        </div>
        <p className="dim" style={{ fontSize: 13.5, marginBottom: 0 }}>
          A ratio of small counts can be large without being well determined, so the count-based ranking and the
          Bayesian one agree more closely once genes with little observed variation are set aside. Both correlations are
          computed in the browser from the values in this dataset.
        </p>
      </div>

      <SectionTitle>Provenance</SectionTitle>
      <div className="card card-pad">
        <dl className="kv method-list">
          {Object.entries(metadata.methods).map(([key, description]) => (
            <div key={key} className="method-row">
              <dt>{key}</dt>
              <dd className="dim">{description}</dd>
            </div>
          ))}
        </dl>
        <Provenance>
          Derived from a snapshot of the study's master sheet, <code>{metadata.snapshot.path}</code>, SHA-256{' '}
          <code className="mono">{metadata.snapshot.checksum.value.slice(0, 16)}…</code>. Cohort composition comes from{' '}
          <code>{metadata.cohortSnapshot.path}</code>. Ratios, P-values and every significance call on this page are
          recomputed here from the measured counts and posterior summaries, not read from the sheet.
          {check ? (
            <>
              {' '}
              The recomputation reproduces all {fmtInt(check.chiSqChecked)} published χ² values to within{' '}
              {check.chiSqMaxDelta.toExponential(1)}, and {fmtInt(check.pnpsChecked - check.pnpsOutliers)} of{' '}
              {fmtInt(check.pnpsChecked)} published pN/pS values exactly; the remaining {check.pnpsOutliers} differ by at
              most {check.pnpsMaxDelta.toFixed(4)} because the sheet publishes possible-site counts rounded to whole sites.
            </>
          ) : null}
        </Provenance>
      </div>
    </div>
  );
}

function GenePanel({
  gene,
  catalog,
  selection,
  onClose,
}: {
  gene: SelectionGene;
  catalog: Dataset;
  selection: SelectionDataset;
  onClose: () => void;
}) {
  const stats = geneStats(gene);
  const entry = catalog.byOrf.get(gene.orf);
  const counts = gene.counts;
  const positives = positiveCriteria(gene);
  const purifiers = purifyingCriteria(gene);
  const { cohorts } = selection.metadata;

  return (
    <div className="card card-pad gene-panel">
      <div className="card-title-row">
        <div>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mono">{gene.orf}</span>
            {gene.gene ? <span className="accent">{gene.gene}</span> : null}
            <CallTag call={stats.call} />
          </h4>
          <p className="dim" style={{ margin: '4px 0 0', fontSize: 13.5 }}>{entry?.annotation ?? '—'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn btn-ghost btn-sm" href={href(`gene/${gene.orf}`)}>
            <ExternalLink size={14} /> Gene page
          </a>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close gene panel">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="gene-panel-grid">
        <section>
          <h5>Posterior comparison</h5>
          <OmegaIntervals gene={gene} />
          <dl className="kv">
            <dt>DPD</dt>
            <dd className="tabnum">{fmt(gene.dpd, 4)} <span className="dim">(rank {gene.dpdRank ?? '—'} of {fmtInt(selection.count)})</span></dd>
            <dt>ω diabetes</dt>
            <dd className="tabnum">{fmt(gene.omegaDb, 3)} <span className="dim">[{fmt(gene.omegaDbLo, 3)}, {fmt(gene.omegaDbHi, 3)}]</span></dd>
            <dt>ω non-diabetes</dt>
            <dd className="tabnum">{fmt(gene.omegaNdb, 3)} <span className="dim">[{fmt(gene.omegaNdbLo, 3)}, {fmt(gene.omegaNdbHi, 3)}]</span></dd>
            <dt>Difference</dt>
            <dd className="tabnum">{fmt(stats.omegaDelta, 3)}</dd>
            <dt>Distinct alleles</dt>
            <dd className="tabnum">{gene.alleles ?? '—'} {gene.repetitive ? <span className="dim">(PE/PPE, outside the allele counts)</span> : null}</dd>
          </dl>
        </section>

        <section>
          <h5>Mutation counts and pN/pS</h5>
          {counts ? (
            <table className="table mini-table">
              <thead>
                <tr>
                  <th />
                  <th style={{ textAlign: 'right' }}>NS</th>
                  <th style={{ textAlign: 'right' }}>S</th>
                  <th style={{ textAlign: 'right' }}>pN/pS</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{cohorts.dbLabel}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{counts.dbNsyn}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{counts.dbSyn}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{fmt(stats.pnps?.db ?? null, 4)}</td>
                </tr>
                <tr>
                  <td>{cohorts.ndbLabel}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{counts.ndbNsyn}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{counts.ndbSyn}</td>
                  <td className="tabnum" style={{ textAlign: 'right' }}>{fmt(stats.pnps?.ndb ?? null, 4)}</td>
                </tr>
              </tbody>
            </table>
          ) : null}
          <dl className="kv" style={{ marginTop: 10 }}>
            <dt>Δlog₂(pN/pS)</dt>
            <dd className="tabnum">
              {fmt(stats.pnps?.deltaLog2 ?? null, 4)}{' '}
              <span className="dim">(published rank {gene.deltaLog2Rank ?? '—'})</span>
            </dd>
            <dt>Possible sites</dt>
            <dd className="tabnum">{fmtInt(gene.nsynSites ?? 0)} nonsyn / {fmtInt(gene.synSites ?? 0)} syn over {fmtInt(gene.codons ?? 0)} codons</dd>
            <dt>Pearson χ²</dt>
            <dd className="tabnum">{fmt(stats.chiSq, 4)}, P = {fmtP(stats.chiSqP)}</dd>
          </dl>
        </section>

        <section>
          <h5>Branch model, M2 against M0</h5>
          {gene.pamlFitted ? (
            <dl className="kv">
              <dt>ω free, diabetes clade</dt>
              <dd className="tabnum">{fmt(gene.pamlOmegaDb, 4)}</dd>
              <dt>ω free, non-diabetes clade</dt>
              <dd className="tabnum">{fmt(gene.pamlOmegaNdb, 4)}</dd>
              <dt>2ΔLL (signed)</dt>
              <dd className="tabnum">{fmt(gene.pamlSigned2LL, 4)}</dd>
              <dt>P (χ², 1 df)</dt>
              <dd className="tabnum">{fmtP(stats.lrtP)}</dd>
              <dt>Verdict at α = 0.05</dt>
              <dd>
                {stats.lrtSignificant ? (
                  <span className="call-tag call-positive">two ω beat one</span>
                ) : (
                  <span className="dim">one shared ω is not rejected</span>
                )}
              </dd>
              <dt>Fitted on</dt>
              <dd className="tabnum">{fmtInt(gene.pamlHaplotypes ?? 0)} unique haplotypes</dd>
            </dl>
          ) : (
            <p className="dim" style={{ fontSize: 13.5 }}>
              Not fitted — <b>{gene.pamlStatus ?? 'no status recorded'}</b>. ω is a ratio of nonsynonymous to synonymous
              rates, so a cohort with none of one kind has no estimate to give; the Bayesian comparison still covers this
              gene because its priors carry the estimate where the data do not.
            </p>
          )}
        </section>

        <section>
          <h5>Criteria</h5>
          <div className="criteria-block">
            <h6>Positive selection in diabetes</h6>
            <ul className="criteria">
              {positives.map((criterion) => (
                <li key={criterion.id} data-pass={criterion.pass}>
                  {criterion.pass ? <Check size={13} /> : <X size={13} />} {criterion.label}
                </li>
              ))}
            </ul>
            <h6>Purifying selection in diabetes</h6>
            <ul className="criteria">
              {purifiers.map((criterion) => (
                <li key={criterion.id} data-pass={criterion.pass}>
                  {criterion.pass ? <Check size={13} /> : <X size={13} />} {criterion.label}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <Provenance>
        <b>Inputs.</b> One alignment per cohort in the H37Rv frame: {fmtInt(cohorts.db)} diabetes sequences and{' '}
        {fmtInt(cohorts.ndb)} non-diabetes, {fmtInt(gene.codons ?? 0)} codons each, plus the pooled{' '}
        {fmtInt(cohorts.total)} for the allele count.{' '}
        <b>Models.</b> GenomegaMap Constant model for the two posteriors, 1,600 retained samples each; DPD from 10,000
        paired draws; Pearson χ² on the four counts above; codeml M0 and M2 on the pruned 922-isolate tree.{' '}
        <b>Outputs.</b> Every number in this panel is either one of those model outputs or is recomputed here from them.
      </Provenance>
    </div>
  );
}
