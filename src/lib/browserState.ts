import { CATEGORIES } from './categories';
import type { CategoryId, EssentialityCall } from './types';

export type BrowserSortKey = 'position' | 'orf' | 'gene' | 'length' | 'category' | 'essentiality';
export type BrowserDirection = 1 | -1;

export interface BrowserState {
  q: string;
  cats: CategoryId[];
  strand: 'all' | '+' | '-';
  ess: EssentialityCall[];
  sort: BrowserSortKey;
  dir: BrowserDirection;
  page: number;
}

export const ESSENTIALITY_FILTERS: EssentialityCall[] = ['essential', 'growth-defect', 'non-essential', 'uncertain'];
export const BROWSER_SORT_KEYS: BrowserSortKey[] = ['position', 'orf', 'gene', 'length', 'category', 'essentiality'];
export const DEFAULT_BROWSER_STATE: BrowserState = {
  q: '',
  cats: [],
  strand: 'all',
  ess: [],
  sort: 'position',
  dir: 1,
  page: 0,
};

const CATEGORY_IDS = new Set<CategoryId>(CATEGORIES.map((c) => c.id));
const ESS_IDS = new Set<EssentialityCall>([
  'essential',
  'growth-defect',
  'non-essential',
  'uncertain',
  'no-data',
]);
const SORT_IDS = new Set<BrowserSortKey>(BROWSER_SORT_KEYS);

function uniqueCsv(value: string | undefined): string[] {
  if (!value) return [];
  return Array.from(new Set(value.split(',').map((v) => v.trim()).filter(Boolean)));
}

function readPage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 1 ? parsed - 1 : 0;
}

export function parseBrowserState(params: Record<string, string>): BrowserState {
  const cats = uniqueCsv(params.cat).filter((id): id is CategoryId => CATEGORY_IDS.has(id as CategoryId));
  const ess = uniqueCsv(params.ess).filter((id): id is EssentialityCall => ESS_IDS.has(id as EssentialityCall));
  const strand = params.strand === '+' || params.strand === '-' ? params.strand : 'all';
  const sort = SORT_IDS.has(params.sort as BrowserSortKey) ? (params.sort as BrowserSortKey) : 'position';
  const dir = params.dir === 'desc' ? -1 : 1;

  return {
    q: (params.q ?? '').trim(),
    cats,
    strand,
    ess,
    sort,
    dir,
    page: readPage(params.page),
  };
}

export function browserStatePath(state: BrowserState): string {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.cats.length) params.set('cat', state.cats.join(','));
  if (state.strand !== 'all') params.set('strand', state.strand);
  if (state.ess.length) params.set('ess', state.ess.join(','));
  if (state.sort !== DEFAULT_BROWSER_STATE.sort) params.set('sort', state.sort);
  if (state.dir !== DEFAULT_BROWSER_STATE.dir) params.set('dir', 'desc');
  if (state.page > 0) params.set('page', String(state.page + 1));
  const query = params.toString();
  return query ? `browse?${query}` : 'browse';
}
