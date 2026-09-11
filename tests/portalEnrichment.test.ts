import { afterEach, describe, expect, it, vi } from 'vitest';
import { annotationRows, formatPnps, loadPortalEnrichment, resetPortalEnrichmentCache } from '../src/lib/portalEnrichment';

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

describe('portal enrichment loading', () => {
  afterEach(() => {
    resetPortalEnrichmentCache();
    vi.unstubAllGlobals();
  });

  it('does not cache an empty map after a fetch failure', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ source: 'x', builtAt: '2026-01-01', count: 1, genes: { Rv0001: { up: 'P9WNW3' } } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadPortalEnrichment()).rejects.toThrow('portal enrichment HTTP 503');
    const map = await loadPortalEnrichment();
    expect(map.get('Rv0001')?.uniprot).toBe('P9WNW3');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
