import { describe, expect, it } from 'vitest';
import { positiveSelectionSummary } from '../src/lib/positiveSelection';

describe('comparison selection measurements', () => {
  it('leaves absent enrichment unavailable instead of generating values', () => {
    expect(positiveSelectionSummary()).toBe('Not available');
    expect(positiveSelectionSummary({})).toBe('Not available');
  });

  it('preserves partial measurements without filling their gaps', () => {
    expect(positiveSelectionSummary({ omegaPeak: 2.5 })).toBe('Not available · peak 2.5 (—)');
    expect(positiveSelectionSummary({ underSelection: false })).toBe('NO · peak — (—)');
    expect(positiveSelectionSummary({ omegaLower: 1.2 })).toBe('YES · peak — (1.2)');
  });

  it('preserves reported false and zero values and rejects nonfinite measurements', () => {
    expect(positiveSelectionSummary({ underSelection: false, omegaPeak: 0, omegaLower: 0 })).toBe('NO · peak 0 (0)');
    expect(positiveSelectionSummary({ omegaPeak: NaN, omegaLower: Infinity })).toBe('Not available');
  });
});
