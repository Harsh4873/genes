import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DatasetValidationError,
  loadDataset,
  resetDatasetCache,
  validateDataset,
} from '../src/lib/dataset';
import publishedDataset from '../public/data/genes.json';

function rawDataset(source = 'test source') {
  return {
    organism: 'test organism',
    source,
    note: 'test note',
    count: 1,
    categories: { unclassified: 1 },
    genes: [
      { o: 'Rv0001', g: 'geneA', s: 1, e: 300, d: '+' as const, l: 100, a: 'annotation', c: 'unclassified' },
    ],
  };
}

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

afterEach(() => {
  resetDatasetCache();
  vi.unstubAllGlobals();
});

describe('dataset validation and loading', () => {
  it('accepts the currently published catalog', () => {
    expect(validateDataset(publishedDataset).genes).toHaveLength(publishedDataset.count);
  });

  it('validates JSON and builds a lookup map', () => {
    const dataset = validateDataset(rawDataset());
    expect(dataset.count).toBe(1);
    expect(dataset.byOrf.get('Rv0001')).toMatchObject({ name: 'geneA', bp: 300 });
  });

  it('rejects inconsistent and duplicate records', () => {
    expect(() => validateDataset({ ...rawDataset(), count: 2 })).toThrow(DatasetValidationError);
    const duplicate = rawDataset();
    duplicate.genes.push({ ...duplicate.genes[0] });
    duplicate.count = 2;
    duplicate.categories.unclassified = 2;
    expect(() => validateDataset(duplicate)).toThrow(/duplicate gene identifier/);
  });

  it('clears a rejected promise so a normal retry can succeed', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response(rawDataset()));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadDataset({ force: true })).rejects.toThrow('Failed to load gene catalog (503)');
    await expect(loadDataset()).resolves.toMatchObject({ count: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('memoizes successful loads but permits an explicit force refresh', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(rawDataset('first')))
      .mockResolvedValueOnce(response(rawDataset('second')));
    vi.stubGlobal('fetch', fetchMock);

    const first = await loadDataset();
    expect(await loadDataset()).toBe(first);
    expect((await loadDataset({ force: true })).source).toBe('second');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toEqual({ cache: 'reload' });
  });
});
