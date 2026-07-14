import { useMemo } from 'react';
import { ArrowRight, Columns3, Table2, Database, Microscope } from 'lucide-react';
import type { Dataset } from '../lib/types';
import { CATEGORIES, category } from '../lib/categories';
import { href, navigate } from '../lib/router';
import { fmtInt } from '../lib/format';
import { GeneSearch } from '../components/GeneSearch';
import { Donut } from '../components/Charts';
import { SourceBadge } from '../components/common';

const FEATURED = ['Rv1908c', 'Rv0667', 'Rv1484', 'Rv0006', 'Rv0001', 'Rv3875', 'Rv3133c', 'Rv2031c'];

export function Home({ dataset }: { dataset: Dataset }) {
  const stats = useMemo(() => {
    const genomeLen = Math.max(...dataset.genes.map((g) => g.end));
    const named = dataset.genes.filter((g) => g.gene).length;
    const avgLen = Math.round(dataset.genes.reduce((s, g) => s + g.length, 0) / dataset.genes.length);
    return { genomeLen, named, avgLen };
  }, [dataset]);

  const donut = useMemo(
    () =>
      CATEGORIES.filter((c) => dataset.categories[c.id]).map((c) => ({
        label: c.label,
        value: dataset.categories[c.id] ?? 0,
        color: c.color,
      })),
    [dataset],
  );

  const featured = FEATURED.map((o) => dataset.byOrf.get(o)).filter(Boolean);
  const checksum = dataset.metadata?.snapshot.checksum.value;

  return (
    <div className="container">
      <section className="hero">
        <DnaStrip />
        <h1>The tuberculosis genome, built for comparison.</h1>
        <p className="lede">
          Search the H37Rv catalog and open lean gene pages with portal annotations, TMHMM topology, GenomegaMap omega plots,
          lineage pN/pS, and protein sequence — then compare genes side by side.
        </p>
        <div className="hero-search">
          <GeneSearch genes={dataset.genes} variant="hero" placeholder="Try katG, Rv0667, gyrase, or “efflux transporter”…" />
        </div>
        <div className="source-strip home-source-strip" aria-label="Data source summary">
          <SourceBadge kind="reference" />
          <span className="dim">Exact {fmtInt(dataset.count)}-gene catalog plus published portal plot assets.</span>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <a className="btn btn-primary" href={href('browse')}><Table2 size={16} /> Browse genes</a>
          <a className="btn" href={href('compare')}><Columns3 size={16} /> Open comparison panel</a>
        </div>
        <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="faint" style={{ fontSize: 13 }}>Jump to:</span>
          {featured.map((g) => (
            <a key={g!.orf} className="chip" href={href(`gene/${g!.orf}`)}>
              <span className="mono">{g!.orf}</span>
              {g!.gene ? <span style={{ color: 'var(--accent-strong)' }}>{g!.gene}</span> : null}
            </a>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="stat-row">
          <div className="stat"><div className="num tabnum">{fmtInt(dataset.count)}</div><div className="lab">Protein-coding genes</div></div>
          <div className="stat"><div className="num tabnum">{(stats.genomeLen / 1e6).toFixed(2)} Mb</div><div className="lab">Genome length</div></div>
          <div className="stat"><div className="num tabnum">{fmtInt(stats.named)}</div><div className="lab">Genes with a symbol</div></div>
          <div className="stat"><div className="num tabnum">{stats.avgLen}</div><div className="lab">Mean protein length (aa)</div></div>
        </div>
      </section>

      <section className="section">
        <div className="grid-2">
          <div className="card card-pad">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', marginBottom: 4 }}>
              <h3 style={{ fontSize: 16, margin: 0 }}>Functional classes</h3>
              <SourceBadge kind="reference" compact />
            </div>
            <p className="dim" style={{ fontSize: 13.5, margin: '0 0 8px' }}>
              Class assignment from product annotation. Click a slice to open the browser filtered to that class.
            </p>
            <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
              <Donut data={donut} size={190} onSlice={(label) => {
                const c = CATEGORIES.find((x) => x.label === label);
                if (c) navigate(`browse?cat=${c.id}`);
              }} />
              <div style={{ display: 'grid', gap: 5, flex: 1, minWidth: 210 }}>
                {donut.map((d) => {
                  const c = CATEGORIES.find((x) => x.label === d.label)!;
                  return (
                    <a key={d.label} href={href(`browse?cat=${c.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span className="dot" style={{ background: d.color }} />
                      <span style={{ flex: 1 }}>{c.short}</span>
                      <span className="dim tabnum">{fmtInt(d.value)}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
            <a className="link-card" href={href('compare')}>
              <h3><Columns3 size={18} style={{ color: 'var(--accent)' }} /> Multi-gene comparison</h3>
              <p>Line up annotations, TMHMM, omega plots, pN/pS and sequence across genes. Shareable by URL.</p>
              <span className="btn btn-ghost btn-sm" style={{ marginTop: 10, paddingLeft: 0 }}>Compare genes <ArrowRight size={15} /></span>
            </a>
            <a className="link-card" href={href('browse')}>
              <h3><Table2 size={18} style={{ color: 'var(--accent)' }} /> Gene browser</h3>
              <p>Search and filter the H37Rv catalog by class, strand and length.</p>
            </a>
            <a className="link-card" href={href('datasets')}>
              <h3><Database size={17} style={{ color: 'var(--accent)' }} /> Datasets & provenance</h3>
              <p>
                Catalog snapshot
                {checksum ? <> · sha256 <span className="mono" style={{ fontSize: 12 }}>{checksum.slice(0, 12)}…</span></> : null}
                {' '}and portal plot sources.
              </p>
            </a>
            <a className="link-card" href={href('about')}>
              <h3><Microscope size={17} style={{ color: 'var(--accent)' }} /> About</h3>
              <p>What this mirror keeps from the TB Genome Portal.</p>
            </a>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="card card-pad" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <span className="dim" style={{ fontSize: 13.5, fontWeight: 600 }}>Browse a class:</span>
          {CATEGORIES.filter((c) => dataset.categories[c.id]).map((c) => (
            <a key={c.id} className="chip" href={href(`browse?cat=${c.id}`)}>
              <span className="dot" style={{ background: category(c.id).color }} /> {c.short}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

function DnaStrip() {
  const rungs = Array.from({ length: 22 });
  return (
    <svg className="dna-strip" viewBox="0 0 200 400" fill="none" aria-hidden="true">
      {rungs.map((_, i) => {
        const y = i * 19 + 8;
        const phase = Math.sin(i * 0.6);
        const x1 = 100 + phase * 60;
        const x2 = 100 - phase * 60;
        return (
          <g key={i}>
            <line x1={x1} y1={y} x2={x2} y2={y} stroke="var(--accent)" strokeWidth={2} strokeOpacity={0.5} />
            <circle cx={x1} cy={y} r={3.4} fill="var(--accent)" fillOpacity={0.8} />
            <circle cx={x2} cy={y} r={3.4} fill="var(--accent-strong)" fillOpacity={0.7} />
          </g>
        );
      })}
    </svg>
  );
}
