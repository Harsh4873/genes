import { useMemo } from 'react';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Columns3, X, Plus, Check } from 'lucide-react';
import type { Dataset, Gene } from '../lib/types';
import { CATEGORIES, category } from '../lib/categories';
import {
  browserStatePath,
  parseBrowserState,
  type BrowserSortKey,
} from '../lib/browserState';
import { href, replaceRoute, useRoute } from '../lib/router';
import { fmtInt } from '../lib/format';
import { compareStore, useCompare } from '../lib/compareStore';
import { CategoryTag } from '../components/common';

const PAGE = 50;

export function Browser({ dataset }: { dataset: Dataset }) {
  const route = useRoute();
  const compare = useCompare();
  const state = useMemo(() => parseBrowserState(route.params), [route.raw]);
  const cats = useMemo(() => new Set(state.cats), [state.cats]);

  const filtered = useMemo(() => {
    const terms = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let list = dataset.genes.filter((g) => {
      if (cats.size && !cats.has(g.category)) return false;
      if (state.strand !== 'all' && g.strand !== state.strand) return false;
      if (terms.length) {
        const hay = `${g.orf} ${g.gene ?? ''} ${g.annotation}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
    const cmp: Record<Exclude<BrowserSortKey, 'essentiality'>, (a: Gene, b: Gene) => number> = {
      position: (a, b) => a.start - b.start,
      orf: (a, b) => a.orf.localeCompare(b.orf, undefined, { numeric: true }),
      gene: (a, b) => (a.gene ?? 'zzz').localeCompare(b.gene ?? 'zzz'),
      length: (a, b) => a.length - b.length,
      category: (a, b) => category(a.category).label.localeCompare(category(b.category).label),
    };
    const sortKey = state.sort === 'essentiality' ? 'position' : state.sort;
    list = [...list].sort((a, b) => cmp[sortKey](a, b) * state.dir || a.start - b.start);
    return list;
  }, [dataset, state.q, state.strand, state.sort, state.dir, cats]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const page = Math.min(state.page, pages - 1);
  const pageItems = filtered.slice(page * PAGE, page * PAGE + PAGE);

  const update = (patch: Partial<typeof state>, resetPage = true) => {
    replaceRoute(browserStatePath({ ...state, ...patch, page: resetPage ? 0 : patch.page ?? state.page }));
  };

  const setSortKey = (key: Exclude<BrowserSortKey, 'essentiality'>) => {
    update(
      state.sort === key
        ? { dir: state.dir === 1 ? -1 : 1 }
        : { sort: key, dir: key === 'length' ? -1 : 1 },
    );
  };

  const toggleCat = (id: (typeof state.cats)[number]) => {
    const next = cats.has(id) ? state.cats.filter((cat) => cat !== id) : [...state.cats, id];
    update({ cats: next });
  };
  const clearAll = () => update({ q: '', cats: [], strand: 'all', ess: [] });
  const hasFilters = cats.size || state.strand !== 'all' || state.q.trim();

  const sortIcon = (key: Exclude<BrowserSortKey, 'essentiality'>) => state.sort !== key ? <ArrowUpDown size={12} style={{ opacity: 0.4 }} /> : state.dir === 1 ? <ArrowUp size={12} className="arrow" /> : <ArrowDown size={12} className="arrow" />;
  const SortHeader = ({ label, sortKey, align }: { label: string; sortKey: Exclude<BrowserSortKey, 'essentiality'>; align?: 'right' }) => (
    <th aria-sort={state.sort === sortKey ? (state.dir === 1 ? 'ascending' : 'descending') : 'none'} style={align === 'right' ? { textAlign: 'right' } : undefined}>
      <button className="th-sort" type="button" onClick={() => setSortKey(sortKey)}>
        <span>{label}</span>
        {sortIcon(sortKey)}
      </button>
    </th>
  );

  return (
    <div className="container wide">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ fontSize: 24 }}>Gene browser</h1>
        {compare.length ? (
          <a className="btn btn-primary btn-sm" href={href('compare')}><Columns3 size={15} /> Compare {compare.length} gene{compare.length > 1 ? 's' : ''}</a>
        ) : null}
      </div>

      <div className="toolbar" style={{ marginTop: 14 }}>
        <div className="search" style={{ maxWidth: 380, flex: 1 }}>
          <div className="search-input-wrap">
            <Search size={16} style={{ color: 'var(--text-faint)' }} />
            <input value={state.q} onChange={(e) => update({ q: e.target.value })} placeholder="Filter by Rv id, symbol or function..." spellCheck={false} aria-label="Filter genes" />
            {state.q ? <button type="button" className="inline-clear" onClick={() => update({ q: '' })} aria-label="Clear gene filter"><X size={15} /></button> : null}
          </div>
        </div>
        <div className="segmented" aria-label="Strand filter">
          {(['all', '+', '-'] as const).map((s) => (
            <button key={s} type="button" className={`segmented-item${state.strand === s ? ' on' : ''}`} aria-pressed={state.strand === s} onClick={() => update({ strand: s })}>
              {s === 'all' ? 'Both strands' : s === '+' ? 'Forward +' : 'Reverse -'}
            </button>
          ))}
        </div>
        {hasFilters ? <button className="btn btn-ghost btn-sm" onClick={clearAll}><X size={14} /> Clear</button> : null}
      </div>

      <div className="filter-scroll" style={{ marginBottom: 12 }}>
        {CATEGORIES.filter((c) => dataset.categories[c.id]).map((c) => (
          <button key={c.id} type="button" className={`chip${cats.has(c.id) ? ' on' : ''}`} aria-pressed={cats.has(c.id)} onClick={() => toggleCat(c.id)}>
            <span className="dot" style={{ background: c.color }} /> {c.short}
            <span className="faint tabnum" style={{ fontSize: 11 }}>{fmtInt(dataset.categories[c.id])}</span>
          </button>
        ))}
      </div>

      <div className="result-meta">
        Showing <b className="tabnum">{filtered.length ? page * PAGE + 1 : 0}–{Math.min((page + 1) * PAGE, filtered.length)}</b> of <b className="tabnum">{fmtInt(filtered.length)}</b> genes
      </div>

      <div className="table-wrap gene-table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="no-sort" style={{ width: 40 }} title="Add to comparison" />
              <SortHeader label="ORF" sortKey="orf" />
              <SortHeader label="Gene" sortKey="gene" />
              <th className="no-sort">Product</th>
              <SortHeader label="Class" sortKey="category" />
              <SortHeader label="Length" sortKey="length" align="right" />
              <SortHeader label="Position" sortKey="position" />
            </tr>
          </thead>
          <tbody>
            {pageItems.map((g) => {
              const selected = compareStore.has(g.orf);
              return (
                <tr key={g.orf}>
                  <td>
                    <button
                      type="button"
                      className="icon-btn compare-toggle"
                      data-selected={selected}
                      onClick={() => compareStore.toggle(g.orf)}
                      aria-pressed={selected}
                      aria-label={`${selected ? 'Remove' : 'Add'} ${g.orf} ${selected ? 'from' : 'to'} comparison`}
                      title={selected ? 'Remove from comparison' : 'Add to comparison'}
                    >
                      {selected ? <Check size={14} /> : <Plus size={14} />}
                    </button>
                  </td>
                  <td><a className="row-link mono" href={href(`gene/${g.orf}`)}>{g.orf}</a></td>
                  <td>{g.gene ? <a className="row-link accent" href={href(`gene/${g.orf}`)}>{g.gene}</a> : <span className="faint">-</span>}</td>
                  <td className="dim" style={{ maxWidth: 460, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.annotation}</td>
                  <td><CategoryTag id={g.category} /></td>
                  <td className="tabnum dim" style={{ textAlign: 'right' }}>{fmtInt(g.length)} aa</td>
                  <td className="mono dim" style={{ fontSize: 12.5 }}>{g.strand}{(g.start / 1000).toFixed(0)}k</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!pageItems.length ? <div className="empty-state">No genes match these filters.</div> : null}
      </div>

      <div className="gene-card-list" aria-label="Gene results">
        {pageItems.map((g) => {
          const selected = compareStore.has(g.orf);
          return (
            <article key={g.orf} className="gene-card">
              <div className="gene-card-head">
                <div>
                  <a className="row-link mono" href={href(`gene/${g.orf}`)}>{g.orf}</a>
                  {g.gene ? <a className="row-link accent gene-card-symbol" href={href(`gene/${g.orf}`)}>{g.gene}</a> : null}
                </div>
                <button
                  type="button"
                  className="icon-btn compare-toggle"
                  data-selected={selected}
                  onClick={() => compareStore.toggle(g.orf)}
                  aria-pressed={selected}
                  aria-label={`${selected ? 'Remove' : 'Add'} ${g.orf} ${selected ? 'from' : 'to'} comparison`}
                >
                  {selected ? <Check size={14} /> : <Plus size={14} />}
                </button>
              </div>
              <p>{g.annotation}</p>
              <div className="gene-card-meta">
                <CategoryTag id={g.category} />
                <span className="mono dim">{g.strand}{(g.start / 1000).toFixed(0)}k</span>
                <span className="tabnum dim">{fmtInt(g.length)} aa</span>
              </div>
            </article>
          );
        })}
      </div>

      {pages > 1 ? (
        <div className="pagerow">
          <button className="btn btn-sm" disabled={page === 0} onClick={() => update({ page: Math.max(0, page - 1) }, false)}>Previous</button>
          <span className="dim tabnum" style={{ fontSize: 13.5 }}>Page {page + 1} of {pages}</span>
          <button className="btn btn-sm" disabled={page >= pages - 1} onClick={() => update({ page: Math.min(pages - 1, page + 1) }, false)}>Next</button>
        </div>
      ) : null}
    </div>
  );
}
