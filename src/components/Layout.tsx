import { useEffect, useRef, useState } from 'react';
import { Dna, Menu, MonitorSmartphone, Moon, Sun, X } from 'lucide-react';
import type { Gene } from '../lib/types';
import { href, useRoute } from '../lib/router';
import { useTheme } from '../lib/theme';
import { GeneSearch } from './GeneSearch';

const NAV = [
  { path: 'home', label: 'Overview' },
  { path: 'browse', label: 'Browse' },
  { path: 'compare', label: 'Compare' },
  { path: 'datasets', label: 'Datasets' },
  { path: 'about', label: 'About' },
];

export function Layout({ genes, children }: { genes: Gene[]; children: React.ReactNode }) {
  const route = useRoute();
  const [theme, toggleTheme] = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // "/" focuses the global search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The same route subscription used for aria-current also closes the mobile
  // navigation after a link has been followed.
  useEffect(() => setMenuOpen(false), [route.raw]);

  useEffect(() => {
    if (!menuOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [menuOpen]);

  const active = route.path === 'gene' ? 'browse' : route.path;
  const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';

  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          // The app uses the URL hash for routing, so focus the landmark without
          // replacing the current route with #main-content.
          e.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to main content
      </a>
      <header className={`topnav${menuOpen ? ' menu-open' : ''}`}>
        <a className="brand" href={href('home')} aria-label="MtbScope home">
          <span className="logo"><Dna size={18} /></span>
          <span>
            MtbScope<br />
            <small>M. tuberculosis H37Rv</small>
          </span>
        </a>
        <button
          ref={menuButtonRef}
          className="icon-btn nav-menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          aria-label={menuOpen ? 'Close primary navigation' : 'Open primary navigation'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <nav id="primary-navigation" className="nav-links" aria-label="Primary">
          {NAV.map((n) => (
            <a
              key={n.path}
              className={`nav-link${active === n.path ? ' active' : ''}`}
              href={href(n.path)}
              aria-current={active === n.path ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {n.label}
            </a>
          ))}
        </nav>
        <span className="nav-spacer" />
        <div className="nav-search" role="search">
          <GeneSearch genes={genes} focusRef={searchRef} />
        </div>
        <button
          className="icon-btn theme-toggle"
          type="button"
          onClick={toggleTheme}
          title={`Theme: ${theme}`}
          aria-label={`Theme is ${theme}; switch to ${nextTheme}`}
        >
          {theme === 'light' ? <Sun size={17} /> : theme === 'dark' ? <Moon size={17} /> : <MonitorSmartphone size={16} />}
        </button>
      </header>
      <main id="main-content" tabIndex={-1} style={{ flex: 1 }}>{children}</main>
      <footer className="footer">
        <div>
          MtbScope · a faster, comparison-first reimagining of the{' '}
          <a href="https://orca2.tamu.edu/U19/" target="_blank" rel="noopener noreferrer">TB Genome Portal</a>.{' '}
          Gene catalog from the H37Rv reference annotation. Analytical panels are representative demonstration data —{' '}
          <a href={href('about')}>details</a>.
        </div>
      </footer>
    </div>
  );
}
