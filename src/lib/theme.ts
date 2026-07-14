import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ThemeRoot {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

const KEY = 'mtbscope-theme';
const THEMES = new Set<Theme>(['light', 'dark', 'system']);

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && THEMES.has(value as Theme);
}

function safeStorage(): ThemeStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function safeRoot(): ThemeRoot | null {
  try {
    return typeof document === 'undefined' ? null : document.documentElement;
  } catch {
    return null;
  }
}

export function readStoredTheme(storage: ThemeStorage | null = safeStorage()): Theme {
  if (!storage) return 'system';
  try {
    const value = storage.getItem(KEY);
    return isTheme(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

export function persistTheme(theme: Theme, storage: ThemeStorage | null = safeStorage()): void {
  if (!storage) return;
  try {
    if (theme === 'system') storage.removeItem(KEY);
    else storage.setItem(KEY, theme);
  } catch {
    // Storage can be denied by privacy settings or sandboxing; theme selection
    // should continue to work for the current session.
  }
}

export function applyTheme(theme: Theme, root: ThemeRoot | null = safeRoot()): void {
  if (!root) return;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function nextTheme(theme: Theme): Theme {
  return theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  return [theme, () => setTheme(nextTheme)];
}
