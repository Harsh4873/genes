import { describe, expect, it } from 'vitest';
import { paperSetTabs } from '../src/components/Papers';

describe('paperSetTabs', () => {
  it('orders combined first with each set count beside its label', () => {
    expect(paperSetTabs('katG', 'rifampin', { combined: 0, gene: 214, terms: 1204 })).toEqual([
      { id: 'combined', label: 'katG + rifampin', count: 0 },
      { id: 'gene', label: 'katG', count: 214 },
      { id: 'terms', label: '“rifampin”', count: 1204 },
    ]);
  });

  it('keeps a zero combined count visible instead of dropping the tab', () => {
    const tabs = paperSetTabs('Rv0205', 'essential', { combined: 0, gene: 3, terms: 42 });
    expect(tabs.map((tab) => tab.id)).toEqual(['combined', 'gene', 'terms']);
    expect(tabs[0].count).toBe(0);
  });
});
