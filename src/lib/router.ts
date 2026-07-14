import { useSyncExternalStore } from 'react';

// Hash routing keeps the app static-host friendly under /genes/. Route state is
// held in one external store so every consumer observes the same stable
// snapshot and the browser only needs one pair of history listeners.

export const KNOWN_ROUTE_PATHS = ['home', 'browse', 'gene', 'compare', 'datasets', 'about'] as const;

export type KnownRoutePath = (typeof KNOWN_ROUTE_PATHS)[number];
export type RoutePath = KnownRoutePath | 'not-found';

const KNOWN_ROUTES = new Set<string>(KNOWN_ROUTE_PATHS);

export interface Route {
  path: RoutePath;
  /** Decoded first path segment, retained when path is "not-found". */
  requestedPath: string;
  params: Record<string, string>;
  raw: string;
  notFound: boolean;
}

export function isKnownRoutePath(path: string): path is KnownRoutePath {
  return KNOWN_ROUTES.has(path);
}

/** decodeURIComponent without allowing a malformed shared URL to crash render. */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseHash(hash: string): Route {
  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const clean = withoutHash.startsWith('/') ? withoutHash.slice(1) : withoutHash;
  const queryAt = clean.indexOf('?');
  const pathPart = queryAt === -1 ? clean : clean.slice(0, queryAt);
  const queryPart = queryAt === -1 ? '' : clean.slice(queryAt + 1);
  const segments = pathPart.split('/').filter(Boolean).map(safeDecode);
  const requestedPath = segments[0] || 'home';

  // Only gene routes use a second path segment. Treat other trailing segments
  // as not found instead of silently rendering an unrelated page.
  const hasUnexpectedSegments = requestedPath === 'gene' ? segments.length > 2 : segments.length > 1;
  const known = isKnownRoutePath(requestedPath) && !hasUnexpectedSegments;
  const params: Record<string, string> = Object.create(null) as Record<string, string>;
  if (requestedPath === 'gene' && segments[1]) params.id = segments[1];

  // URLSearchParams follows browser query semantics (including + for spaces)
  // and tolerates malformed percent escapes rather than throwing.
  const search = new URLSearchParams(queryPart);
  search.forEach((value, key) => {
    if (key) params[key] = value;
  });

  return {
    path: known ? requestedPath : 'not-found',
    requestedPath,
    params,
    raw: clean,
    notFound: !known,
  };
}

const SERVER_ROUTE = parseHash('');
let cachedHash: string | null = null;
let cachedRoute = SERVER_ROUTE;
const listeners = new Set<() => void>();
let listening = false;

function browserHash(): string {
  return typeof window === 'undefined' ? '' : window.location.hash;
}

function refreshSnapshot(): boolean {
  const nextHash = browserHash();
  if (cachedHash === nextHash) return false;
  cachedHash = nextHash;
  cachedRoute = parseHash(nextHash);
  return true;
}

export function getRouteSnapshot(): Route {
  refreshSnapshot();
  return cachedRoute;
}

function notifyIfChanged(): void {
  if (!refreshSnapshot()) return;
  listeners.forEach((listener) => listener());
}

function startListening(): void {
  if (listening || typeof window === 'undefined') return;
  window.addEventListener('hashchange', notifyIfChanged);
  window.addEventListener('popstate', notifyIfChanged);
  listening = true;
}

function stopListening(): void {
  if (!listening || typeof window === 'undefined') return;
  window.removeEventListener('hashchange', notifyIfChanged);
  window.removeEventListener('popstate', notifyIfChanged);
  listening = false;
}

export function subscribeToRoute(listener: () => void): () => void {
  listeners.add(listener);
  startListening();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) stopListening();
  };
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribeToRoute, getRouteSnapshot, () => SERVER_ROUTE);
}

export function href(to: string): string {
  if (to.startsWith('#')) return to;
  return `#/${to.replace(/^\/+/, '')}`;
}

type HistoryMode = 'push' | 'replace';

function commitRoute(to: string, mode: HistoryMode): void {
  if (typeof window === 'undefined') return;
  const target = href(to);
  if (window.location.hash === target) return;

  try {
    const method = mode === 'push' ? 'pushState' : 'replaceState';
    window.history[method](window.history.state, '', target);
    notifyIfChanged();
  } catch {
    // Sandboxed documents can reject History API calls. Hash assignment still
    // keeps navigation functional; notify synchronously and dedupe its event.
    if (mode === 'replace' && typeof window.location.replace === 'function') window.location.replace(target);
    else window.location.hash = target;
    notifyIfChanged();
  }
}

export function pushRoute(to: string): void {
  commitRoute(to, 'push');
}

export function replaceRoute(to: string): void {
  commitRoute(to, 'replace');
}

/** Concise aliases for callers that model navigation as history operations. */
export const push = pushRoute;
export const replace = replaceRoute;

/** Backward-compatible imperative navigation; new code may call pushRoute. */
export function navigate(to: string): void {
  pushRoute(to);
}
