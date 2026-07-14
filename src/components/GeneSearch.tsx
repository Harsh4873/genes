import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { Gene } from '../lib/types';
import { searchGenes } from '../lib/search';
import { highlight } from '../lib/format';
import { navigate } from '../lib/router';
import { CategoryTag } from './common';

interface Props {
  genes: Gene[];
  variant?: 'nav' | 'hero';
  placeholder?: string;
  autoFocus?: boolean;
  onPick?: (gene: Gene) => void;
  focusRef?: React.RefObject<HTMLInputElement>;
}

function Hl({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((seg, i) => (seg.hit ? <span key={i} className="mark">{seg.text}</span> : <span key={i}>{seg.text}</span>))}
    </>
  );
}

export function GeneSearch({ genes, variant = 'nav', placeholder, autoFocus, onPick, focusRef }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const localRef = useRef<HTMLInputElement>(null);
  const inputRef = focusRef ?? localRef;
  const id = useId();
  const listboxId = `${id}-results`;
  const statusId = `${id}-status`;

  const hits = useMemo(() => (query.trim() ? searchGenes(genes, query, 8) : []), [genes, query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (gene: Gene) => {
    setOpen(false);
    setQuery('');
    if (onPick) onPick(gene);
    else navigate(`gene/${gene.orf}`);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (hits.length ? (open ? (a + 1) % hits.length : 0) : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (hits.length ? (open ? (a - 1 + hits.length) % hits.length : hits.length - 1) : 0));
    } else if (e.key === 'Home' && open && hits.length) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End' && open && hits.length) {
      e.preventDefault();
      setActive(hits.length - 1);
    } else if (e.key === 'Enter') {
      if (!open) {
        setOpen(Boolean(query.trim()));
      } else if (hits[active]) {
        e.preventDefault();
        pick(hits[active].gene);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const activeOptionId = open && hits[active] ? `${id}-option-${hits[active].gene.orf}` : undefined;
  const resultAnnouncement = query.trim()
    ? hits.length
      ? `${hits.length} gene result${hits.length === 1 ? '' : 's'} available. Use the arrow keys to review them.`
      : `No genes found for ${query.trim()}.`
    : '';

  return (
    <div
      className="search"
      ref={boxRef}
      style={variant === 'hero' ? { maxWidth: 620 } : undefined}
      onBlur={(e) => {
        if (!boxRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="search-input-wrap">
        <Search size={17} aria-hidden="true" style={{ color: 'var(--text-faint)', flex: 'none' }} />
        <input
          ref={inputRef}
          value={query}
          autoFocus={autoFocus}
          placeholder={placeholder ?? 'Search genes — Rv number, symbol, or function…'}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(Boolean(e.target.value.trim()));
          }}
          onFocus={() => query.trim() && setOpen(true)}
          onKeyDown={onKey}
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={open && Boolean(query.trim())}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-describedby={statusId}
          aria-label="Search genes"
          spellCheck={false}
        />
        {variant === 'nav' ? <span className="kbd" aria-hidden="true">/</span> : null}
      </div>
      <span id={statusId} className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {resultAnnouncement}
      </span>
      {open && query.trim() ? (
        <div id={listboxId} className="search-results" role="listbox" aria-label="Gene search results">
          {hits.length ? (
            hits.map((h, i) => (
              <button
                type="button"
                key={h.gene.orf}
                id={`${id}-option-${h.gene.orf}`}
                className={`search-row${i === active ? ' active' : ''}`}
                role="option"
                aria-selected={i === active}
                tabIndex={-1}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(h.gene)}
              >
                <span className="sr-orf mono"><Hl text={h.gene.orf} query={query} /></span>
                <span className="sr-gene">{h.gene.gene ? <Hl text={h.gene.gene} query={query} /> : <span className="faint">—</span>}</span>
                <span className="sr-ann"><Hl text={h.gene.annotation} query={query} /></span>
                <CategoryTag id={h.gene.category} withLabel={false} />
              </button>
            ))
          ) : (
            <div className="search-empty" role="presentation">No genes match “{query}”.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
