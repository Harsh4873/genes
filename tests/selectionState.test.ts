import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SELECTION_STATE,
  parseSelectionState,
  selectionStatePath,
  thresholdsOf,
} from '../src/lib/selectionState';
import { parseHash } from '../src/lib/router';
import { PUBLISHED_THRESHOLDS } from '../src/lib/selectionStats';

describe('selection lab URL state', () => {
  it('defaults to the published criteria', () => {
    const state = parseSelectionState({});
    expect(thresholdsOf(state)).toEqual(PUBLISHED_THRESHOLDS);
    expect(state.dir).toBe('positive');
    expect(selectionStatePath(state)).toBe('selection');
  });

  it('round-trips a customised view through the query string', () => {
    const state = {
      ...DEFAULT_SELECTION_STATE,
      q: 'secretion',
      dir: 'purifying' as const,
      dpdLow: 0.02,
      allelesPurifying: 20,
      chi: true,
      lrt: true,
      noRepeat: true,
      plot: 'lrt-dpd' as const,
      sort: 'alleles' as const,
      sortDir: 1 as const,
      page: 2,
      gene: 'Rv0350',
    };
    const path = selectionStatePath(state);
    const parsed = parseSelectionState(parseHash(`#/${path}`).params);
    expect(parsed).toEqual(state);
  });

  it('keeps the purifying cutoff mirrored unless it is given explicitly', () => {
    expect(parseSelectionState({ dpd: '0.9' }).dpdLow).toBe(0.1);
    expect(parseSelectionState({ dpd: '0.9', dpdlow: '0.02' }).dpdLow).toBe(0.02);
  });

  it('clamps and ignores nonsense values instead of trusting the URL', () => {
    const state = parseSelectionState({
      dpd: '7',
      omega: '-3',
      alleles: '99999',
      page: '0',
      sort: 'not-a-column',
      plot: 'not-a-plot',
      dir: 'sideways',
    });
    expect(state.dpdHigh).toBe(1);
    expect(state.omegaMin).toBe(0);
    expect(state.allelesPositive).toBe(300);
    expect(state.page).toBe(0);
    expect(state.sort).toBe(DEFAULT_SELECTION_STATE.sort);
    expect(state.plot).toBe(DEFAULT_SELECTION_STATE.plot);
    expect(state.dir).toBe(DEFAULT_SELECTION_STATE.dir);
  });

  it('is reachable as a known route, with a gene deep link', () => {
    const route = parseHash('#/selection?gene=Rv0648&dir=positive');
    expect(route.path).toBe('selection');
    expect(route.notFound).toBe(false);
    expect(parseSelectionState(route.params).gene).toBe('Rv0648');
  });
});
