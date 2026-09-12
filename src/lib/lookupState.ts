import type { CategoryId } from './types';
import { CATEGORIES } from './categories';
import { DEFAULT_PATHWAYS } from './prioritize';

// URL state for GeneLookup, so a gene, extra literature terms and a set of
// pathways are all shareable and bookmarkable — the same contract the
// Selection Lab uses. Scoring weights are fixed in code, not the URL.

export interface LookupState {
  q: string;
  gene: string;
  /** Extra literature tokens (rifampin, essential, …), kept after a gene is picked. */
  term: string;
  pathways: CategoryId[];
  page: number;
}

const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id));

export const DEFAULT_LOOKUP_STATE: LookupState = {
  q: '',
  gene: '',
  term: '',
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
    term: (params.term ?? '').trim(),
    pathways: parsePathways(params.path),
    page: Math.max(0, readInt(params.page, 1, 1, 1000) - 1),
  };
}

export function lookupStatePath(state: LookupState): string {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.gene) params.set('gene', state.gene);
  if (state.term) params.set('term', state.term);
  if (!samePathways(state.pathways, DEFAULT_PATHWAYS)) params.set('path', state.pathways.join(','));
  if (state.page > 0) params.set('page', String(state.page + 1));
  const query = params.toString();
  return query ? `lookup?${query}` : 'lookup';
}
