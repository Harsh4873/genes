import { describe, expect, it } from 'vitest';
import { browserStatePath, parseBrowserState } from '../src/lib/browserState';

describe('browser state query helpers', () => {
  it('parses valid filters and ignores unknown values', () => {
    expect(parseBrowserState({
      q: ' katG ',
      cat: 'cell-wall,not-a-class,metabolism,cell-wall',
      strand: '+',
      ess: 'essential,nope,growth-defect',
      sort: 'length',
      dir: 'desc',
      page: '3',
    })).toEqual({
      q: 'katG',
      cats: ['cell-wall', 'metabolism'],
      strand: '+',
      ess: ['essential', 'growth-defect'],
      sort: 'length',
      dir: -1,
      page: 2,
    });
  });

  it('serializes only non-default state using URLSearchParams encoding', () => {
    expect(browserStatePath({
      q: 'cell wall',
      cats: ['cell-wall'],
      strand: '+',
      ess: ['essential'],
      sort: 'position',
      dir: 1,
      page: 1,
    })).toBe('browse?q=cell+wall&cat=cell-wall&strand=%2B&ess=essential&page=2');
  });

  it('keeps the default browse route clean', () => {
    expect(browserStatePath(parseBrowserState({}))).toBe('browse');
  });
});
