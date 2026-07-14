import { describe, expect, it } from 'vitest';
import { annotationRows, formatPnps } from '../src/lib/portalEnrichment';

describe('portal enrichment helpers', () => {
  it('prefers scraped multi-source annotations over the catalog fallback', () => {
    expect(annotationRows({
      annotations: {
        TBDB: 'hypothetical protein',
        TUBERCULIST: 'Probable conserved membrane protein',
      },
    }, 'catalog product')).toEqual([
      { source: 'TBDB', value: 'hypothetical protein' },
      { source: 'TUBERCULIST', value: 'Probable conserved membrane protein' },
    ]);
  });

  it('falls back to the catalog product when enrichment is missing', () => {
    expect(annotationRows(null, 'Probable conserved membrane protein')).toEqual([
      { source: 'Catalog', value: 'Probable conserved membrane protein' },
    ]);
  });

  it('formats pN/pS values compactly', () => {
    expect(formatPnps(0.880982727)).toBe('0.881');
    expect(formatPnps(undefined)).toBe('—');
  });
});
