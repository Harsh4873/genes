import { PUBLISHED_THRESHOLDS, type Thresholds } from './selectionStats';

// URL state for the Selection Lab, so a filtered view, a chosen plot and a
// focused gene are all shareable and bookmarkable.

export type SelectionDirection = 'positive' | 'purifying' | 'all';
export type SelectionSortKey =
  | 'dpd'
  | 'orf'
  | 'gene'
  | 'omegaDb'
  | 'omegaNdb'
  | 'delta'
  | 'alleles'
  | 'chi'
  | 'lrt';
export type SelectionPlotKind = 'dpd-delta' | 'lrt-dpd' | 'omega';
export type SelectionDirectionality = 1 | -1;

export interface SelectionState extends Thresholds {
  q: string;
  dir: SelectionDirection;
  /** Require a nominally significant chi-square on the same counts. */
  chi: boolean;
  /** Require a significant branch-model likelihood-ratio test. */
  lrt: boolean;
  /** Drop PE, PPE and PE_PGRS genes, which are outside the allele counts. */
  noRepeat: boolean;
  plot: SelectionPlotKind;
  sort: SelectionSortKey;
  sortDir: SelectionDirectionality;
  page: number;
  gene: string;
}

export const SELECTION_SORT_KEYS: SelectionSortKey[] = [
  'dpd',
  'orf',
  'gene',
  'omegaDb',
  'omegaNdb',
  'delta',
  'alleles',
  'chi',
  'lrt',
];

export const SELECTION_PLOTS: SelectionPlotKind[] = ['dpd-delta', 'lrt-dpd', 'omega'];

export const DEFAULT_SELECTION_STATE: SelectionState = {
  ...PUBLISHED_THRESHOLDS,
  q: '',
  dir: 'positive',
  chi: false,
  lrt: false,
  noRepeat: false,
  plot: 'dpd-delta',
  sort: 'dpd',
  sortDir: -1,
  page: 0,
  gene: '',
};

const SORT_IDS = new Set<string>(SELECTION_SORT_KEYS);
const PLOT_IDS = new Set<string>(SELECTION_PLOTS);
const DIRECTIONS = new Set<string>(['positive', 'purifying', 'all']);

function readNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseFloat(value ?? '');
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function parseSelectionState(params: Record<string, string>): SelectionState {
  const dpdHigh = readNumber(params.dpd, DEFAULT_SELECTION_STATE.dpdHigh, 0, 1);
  return {
    q: (params.q ?? '').trim(),
    dir: DIRECTIONS.has(params.dir) ? (params.dir as SelectionDirection) : DEFAULT_SELECTION_STATE.dir,
    dpdHigh,
    // The purifying cutoff mirrors the positive one unless it is given.
    dpdLow: readNumber(params.dpdlow, Number((1 - dpdHigh).toFixed(4)), 0, 1),
    omegaMin: readNumber(params.omega, DEFAULT_SELECTION_STATE.omegaMin, 0, 10),
    allelesPositive: readInt(params.alleles, DEFAULT_SELECTION_STATE.allelesPositive, 0, 300),
    allelesPurifying: readInt(params.allelesneg, DEFAULT_SELECTION_STATE.allelesPurifying, 0, 300),
    chi: params.chi === '1',
    lrt: params.lrt === '1',
    noRepeat: params.norepeat === '1',
    plot: PLOT_IDS.has(params.plot) ? (params.plot as SelectionPlotKind) : DEFAULT_SELECTION_STATE.plot,
    sort: SORT_IDS.has(params.sort) ? (params.sort as SelectionSortKey) : DEFAULT_SELECTION_STATE.sort,
    sortDir: params.sortdir === 'asc' ? 1 : -1,
    page: Math.max(0, readInt(params.page, 1, 1, 1000) - 1),
    gene: (params.gene ?? '').trim(),
  };
}

export function selectionStatePath(state: SelectionState): string {
  const params = new URLSearchParams();
  const d = DEFAULT_SELECTION_STATE;
  if (state.q) params.set('q', state.q);
  if (state.dir !== d.dir) params.set('dir', state.dir);
  if (state.dpdHigh !== d.dpdHigh) params.set('dpd', String(state.dpdHigh));
  if (state.dpdLow !== Number((1 - state.dpdHigh).toFixed(4))) params.set('dpdlow', String(state.dpdLow));
  if (state.omegaMin !== d.omegaMin) params.set('omega', String(state.omegaMin));
  if (state.allelesPositive !== d.allelesPositive) params.set('alleles', String(state.allelesPositive));
  if (state.allelesPurifying !== d.allelesPurifying) params.set('allelesneg', String(state.allelesPurifying));
  if (state.chi) params.set('chi', '1');
  if (state.lrt) params.set('lrt', '1');
  if (state.noRepeat) params.set('norepeat', '1');
  if (state.plot !== d.plot) params.set('plot', state.plot);
  if (state.sort !== d.sort) params.set('sort', state.sort);
  if (state.sortDir !== d.sortDir) params.set('sortdir', 'asc');
  if (state.page > 0) params.set('page', String(state.page + 1));
  if (state.gene) params.set('gene', state.gene);
  const query = params.toString();
  return query ? `selection?${query}` : 'selection';
}

export function thresholdsOf(state: SelectionState): Thresholds {
  return {
    dpdHigh: state.dpdHigh,
    dpdLow: state.dpdLow,
    omegaMin: state.omegaMin,
    allelesPositive: state.allelesPositive,
    allelesPurifying: state.allelesPurifying,
  };
}
