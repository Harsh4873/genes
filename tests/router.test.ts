import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getRouteSnapshot,
  href,
  parseHash,
  pushRoute,
  replaceRoute,
  safeDecode,
  subscribeToRoute,
} from '../src/lib/router';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hash router', () => {
  it('parses known routes and query parameters with URL semantics', () => {
    expect(parseHash('#/gene/Rv0001?q=cell+wall&token=a%3Db')).toMatchObject({
      path: 'gene',
      requestedPath: 'gene',
      notFound: false,
      params: { id: 'Rv0001', q: 'cell wall', token: 'a=b' },
    });
  });

  it('does not throw on malformed percent escapes', () => {
    expect(() => parseHash('#/gene/%E0%A4%A?q=%')).not.toThrow();
    expect(parseHash('#/gene/%E0%A4%A?q=%').params).toEqual({ id: '%E0%A4%A', q: '%' });
    expect(safeDecode('%')).toBe('%');
  });

  it('returns an explicit not-found route for unknown or malformed paths', () => {
    expect(parseHash('#/missing').path).toBe('not-found');
    expect(parseHash('#/missing').requestedPath).toBe('missing');
    expect(parseHash('#/about/extra')).toMatchObject({ path: 'not-found', notFound: true });
  });

  it('creates subpath-safe hash hrefs', () => {
    expect(href('browse?cat=information')).toBe('#/browse?cat=information');
    expect(href('/about')).toBe('#/about');
    expect(href('#/compare')).toBe('#/compare');
  });

  it('keeps a stable snapshot and centralizes push/replace notifications', () => {
    let hash = '#/home';
    const added: string[] = [];
    const removed: string[] = [];
    const historyCalls: string[] = [];
    const fakeWindow = {
      location: {
        get hash() {
          return hash;
        },
        set hash(value: string) {
          hash = value;
        },
        replace(value: string) {
          hash = value;
        },
      },
      history: {
        state: { preserved: true },
        pushState(_state: unknown, _title: string, value: string) {
          historyCalls.push('push');
          hash = value;
        },
        replaceState(_state: unknown, _title: string, value: string) {
          historyCalls.push('replace');
          hash = value;
        },
      },
      addEventListener(name: string) {
        added.push(name);
      },
      removeEventListener(name: string) {
        removed.push(name);
      },
    };
    vi.stubGlobal('window', fakeWindow);

    const first = getRouteSnapshot();
    expect(getRouteSnapshot()).toBe(first);
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    const unsubscribeA = subscribeToRoute(listenerA);
    const unsubscribeB = subscribeToRoute(listenerB);
    expect(added).toEqual(['hashchange', 'popstate']);

    pushRoute('browse?q=test');
    expect(hash).toBe('#/browse?q=test');
    expect(getRouteSnapshot().params.q).toBe('test');
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);

    replaceRoute('about');
    expect(hash).toBe('#/about');
    expect(historyCalls).toEqual(['push', 'replace']);

    unsubscribeA();
    unsubscribeB();
    expect(removed).toEqual(['hashchange', 'popstate']);
  });
});
