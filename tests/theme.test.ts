import { describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  isTheme,
  nextTheme,
  persistTheme,
  readStoredTheme,
  type ThemeStorage,
} from '../src/lib/theme';

function memoryStorage(initial?: string): ThemeStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set('mtbscope-theme', initial);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

describe('theme persistence', () => {
  it('accepts only supported stored themes', () => {
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('sepia')).toBe(false);
    expect(readStoredTheme(memoryStorage('dark'))).toBe('dark');
    expect(readStoredTheme(memoryStorage('sepia'))).toBe('system');
  });

  it('survives denied reads and writes', () => {
    const denied: ThemeStorage = {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      removeItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    };
    expect(readStoredTheme(denied)).toBe('system');
    expect(() => persistTheme('dark', denied)).not.toThrow();
    expect(() => persistTheme('system', denied)).not.toThrow();
  });

  it('persists explicit themes and removes the system preference', () => {
    const storage = memoryStorage();
    persistTheme('light', storage);
    expect(readStoredTheme(storage)).toBe('light');
    persistTheme('system', storage);
    expect(storage.values.has('mtbscope-theme')).toBe(false);
  });

  it('applies and cycles themes without relying on browser globals', () => {
    const root = { setAttribute: vi.fn(), removeAttribute: vi.fn() };
    applyTheme('dark', root);
    expect(root.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
    applyTheme('system', root);
    expect(root.removeAttribute).toHaveBeenCalledWith('data-theme');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
    expect(nextTheme('system')).toBe('light');
  });
});
