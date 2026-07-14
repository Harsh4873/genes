import { describe, expect, it } from 'vitest';
import { exprOverlay } from '../src/components/Charts';
import type { ExpressionPoint } from '../src/lib/types';

// Lightweight pure helpers exercised without a DOM renderer.
function topResponses(points: ExpressionPoint[], limit = 3) {
  const ranked = [...points].sort((a, b) => Math.abs(b.log2fc) - Math.abs(a.log2fc));
  return {
    up: ranked.filter((p) => p.log2fc > 0).slice(0, limit).map((p) => p.conditionId),
    down: ranked.filter((p) => p.log2fc < 0).slice(0, limit).map((p) => p.conditionId),
  };
}

describe('chart helpers', () => {
  it('maps fold-change sign to up/down overlay colors', () => {
    expect(exprOverlay(3).color).toBe('#e5484d');
    expect(exprOverlay(-2).color).toBe('#3b76ef');
    expect(exprOverlay(0).opacity).toBe(0);
  });

  it('ranks strongest induced and repressed conditions', () => {
    const points: ExpressionPoint[] = [
      { conditionId: 'a', label: 'A', group: 'Stress', log2fc: 1.2 },
      { conditionId: 'b', label: 'B', group: 'Drug', log2fc: -4.1 },
      { conditionId: 'c', label: 'C', group: 'Host', log2fc: 3.5 },
      { conditionId: 'd', label: 'D', group: 'Stress', log2fc: -0.4 },
    ];
    expect(topResponses(points, 2)).toEqual({
      up: ['c', 'a'],
      down: ['b', 'd'],
    });
  });
});
