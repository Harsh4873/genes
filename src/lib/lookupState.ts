import type { CategoryId } from './types';
import { CATEGORIES } from './categories';
import { DEFAULT_PATHWAYS, DEFAULT_WEIGHTS, decodeWeights, encodeWeights, type Weights } from './prioritize';

// URL state for GeneLookup, so a gene, a weighting and a set of pathways are
// all shareable and bookmarkable — the same contract the Selection Lab uses.

export interface LookupState {
  q: string;
  gene: string;
  weights: Weights;
  pathways: CategoryId[];
  page: number;
}

const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id));

export const DEFAULT_LOOKUP_STATE: LookupState = {
  q: '',
  gene: '',
  weights: { ...DEFAULT_WEIGHTS },
  pathways: [...DEFAULT_PATHWAYS],
  page: 0,
};

function readInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parsePathways(value: string | undefined): CategoryId[] {
  if (value === undefined) return [...DEFAULT_PATHWAYS];
  // An explicit empty value means "no pathway preference", which is different
  // from the parameter being absent.
  if (value === '') return [];
  const out: CategoryId[] = [];
  for (const part of value.split(',')) {
    const id = part.trim();
    if (CATEGORY_IDS.has(id) && !out.includes(id as CategoryId)) out.push(id as CategoryId);
  }
  return out;
}

function samePathways(a: CategoryId[], b: CategoryId[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export function parseLookupState(params: Record<string, string>): LookupState {
  return {
    q: (params.q ?? '').trim(),
    gene: (params.gene ?? '').trim(),
    weights: decodeWeights(params.w),
    pathways: parsePathways(params.path),
    page: Math.max(0, readInt(params.page, 1, 1, 1000) - 1),
  };
}

export function lookupStatePath(state: LookupState): string {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.gene) params.set('gene', state.gene);
  const weights = encodeWeights(state.weights);
  if (weights !== encodeWeights(DEFAULT_WEIGHTS)) params.set('w', weights);
  if (!samePathways(state.pathways, DEFAULT_PATHWAYS)) params.set('path', state.pathways.join(','));
  if (state.page > 0) params.set('page', String(state.page + 1));
  const query = params.toString();
  return query ? `lookup?${query}` : 'lookup';
}
