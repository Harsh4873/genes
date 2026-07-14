import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { X, Share2, Trash2, Check, Columns3, ExternalLink } from 'lucide-react';
import type { Dataset, Gene } from '../lib/types';
import { derive } from '../lib/derive';
import { href, replaceRoute, useRoute } from '../lib/router';
import { fmtCoord, fmtInt } from '../lib/format';
import { compareStore, useCompare } from '../lib/compareStore';
import { annotationRows, formatPnps, loadPortalEnrichment, type PortalGeneEnrichment } from '../lib/portalEnrichment';
import { GeneSearch } from '../components/GeneSearch';
import { CategoryTag, SourceBadge } from '../components/common';
import { OmegaPlot, TmhmmPlot } from '../components/Charts';
import { PortalFigure } from '../components/PortalFigure';
import {
  portalGenePage,
  portalOmegaPlotUrl,
  portalTmhmmUrl,
  portalVariantsUrl,
} from '../lib/portalPlots';

const PRESETS: { name: string; desc: string; orfs: string[] }[] = [
  { name: 'First-line drug targets', desc: 'rpoB · katG · inhA · gyrA · embB', orfs: ['Rv0667', 'Rv1908c', 'Rv1484', 'Rv0006', 'Rv3795'] },
  { name: 'DosR dormancy regulon', desc: 'dosR · hspX · Rv2626c · Rv2623 · Rv2028c', orfs: ['Rv3133c', 'Rv2031c', 'Rv2626c', 'Rv2623', 'Rv2028c'] },
  { name: 'ESX-1 secretion system', desc: 'esxA · esxB · eccD1 · espI · Rv3870', orfs: ['Rv3875', 'Rv3874', 'Rv3877', 'Rv3876', 'Rv3870'] },
];

export function Compare({ dataset }: { dataset: Dataset }) {
  const route = useRoute();
  const compare = useCompare();
  const [copied, setCopied] = useState(false);
  const [enrichment, setEnrichment] = useState<Map<string, PortalGeneEnrichment>>(new Map());

  const canonicalGenes = (orfs: string[]) => {
    const unique: string[] = [];
    for (const orf of orfs) {
      if (!dataset.byOrf.has(orf) || unique.includes(orf)) continue;
      unique.push(orf);
      if (unique.length >= compareStore.max) break;
    }
    return unique;
  };

  const routePathForGenes = (orfs: string[]) => {
    const genes = canonicalGenes(orfs);
    if (!genes.length) return 'compare';
    const params = new URLSearchParams();
    params.set('genes', genes.join(','));
    return `compare?${params.toString()}`;
  };

  const setCompared = (orfs: string[]) => {
    const genes = canonicalGenes(orfs);
    compareStore.set(genes);
    replaceRoute(routePathForGenes(genes));
  };

  useEffect(() => {
    if (route.params.genes === undefined) return;
    setCompared(route.params.genes.split(',').map((s) => s.trim()));
  }, [route.raw, dataset]);

  useEffect(() => {
    if (route.params.genes !== undefined || !compare.length) return;
    replaceRoute(routePathForGenes(compare));
  }, [compare, route.params.genes]);

  useEffect(() => {
    loadPortalEnrichment().then(setEnrichment);
  }, []);

  const genes = useMemo(
    () => compare.map((o) => dataset.byOrf.get(o)).filter((g): g is Gene => Boolean(g)),
    [compare, dataset],
  );

  const share = () => {
    const url = `${location.origin}${location.pathname}#/${routePathForGenes(compare)}`;
    navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => {});
  };

  if (!genes.length) {
    return (
      <div className="container">
        <h1 style={{ fontSize: 26, display: 'flex', alignItems: 'center', gap: 10 }}><Columns3 size={24} style={{ color: 'var(--accent)' }} /> Comparison panel</h1>
        <p className="dim" style={{ maxWidth: '62ch', marginTop: 6 }}>
          Pin genes side by side to compare annotations, locus, TMHMM, GenomegaMap omega plots, pN/pS and sequence.
        </p>
        <div className="card card-pad" style={{ maxWidth: 560, marginTop: 16 }}>
          <GeneSearch genes={dataset.genes} variant="hero" placeholder="Add a gene - katG, Rv0667, gyrase..." onPick={(g) => setCompared([...compare, g.orf])} />
        </div>
        <div className="section">
          <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: 10 }}>Start from a set</h3>
          <div className="grid-3">
            {PRESETS.map((p) => (
              <button key={p.name} className="link-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setCompared(p.orfs)}>
                <h3 style={{ fontSize: 15 }}>{p.name}</h3>
                <p className="mono" style={{ fontSize: 12.5 }}>{p.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const cols = `150px repeat(${genes.length}, minmax(260px, 1fr))`;
  const Row = ({ label, render, tall }: { label: string; render: (g: Gene, e: PortalGeneEnrichment | undefined) => ReactNode; tall?: boolean }) => (
    <>
      <div className="cmp-rowlabel"><span className="cmp-label-stack"><span>{label}</span><SourceBadge kind="reference" compact /></span></div>
      {genes.map((g) => (
        <div key={g.orf} className="cmp-cell" style={tall ? { minHeight: 46 } : undefined}>{render(g, enrichment.get(g.orf))}</div>
      ))}
    </>
  );

  return (
    <div className="container wide">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Columns3 size={22} style={{ color: 'var(--accent)' }} /> Comparing {genes.length} gene{genes.length > 1 ? 's' : ''}
        </h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ width: 260 }}>
            <GeneSearch genes={dataset.genes} placeholder="Add a gene..." onPick={(g) => setCompared([...compare, g.orf])} />
          </div>
          <button className="btn btn-sm" onClick={share} disabled={!compare.length}>{copied ? <><Check size={15} /> Copied</> : <><Share2 size={15} /> Share</>}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setCompared([])}><Trash2 size={15} /> Clear</button>
        </div>
      </div>

      <div className="compare-board card" style={{ marginTop: 14 }}>
        <div className="compare-grid" style={{ gridTemplateColumns: cols }}>
          <div className="cmp-rowlabel" style={{ background: 'var(--panel)', position: 'sticky', top: 56, left: 0, zIndex: 6 }} />
          {genes.map((g) => (
            <div key={g.orf} className="cmp-header" style={{ position: 'sticky', top: 56, zIndex: 5 }}>
              <button className="icon-btn cmp-remove" style={{ width: 26, height: 26 }} onClick={() => setCompared(compare.filter((orf) => orf !== g.orf))} title="Remove"><X size={14} /></button>
              <a className="cmp-orf" href={href(`gene/${g.orf}`)} style={{ display: 'block' }}>{g.orf}</a>
              {g.gene ? <a className="cmp-sym" href={href(`gene/${g.orf}`)}>{g.gene}</a> : <span className="faint">unnamed</span>}
              <div style={{ marginTop: 6 }}><CategoryTag id={g.category} /></div>
            </div>
          ))}

          <Row label="Product" tall render={(g, e) => {
            const rows = annotationRows(e, g.annotation);
            const primary = rows.find((r) => r.source === 'TUBERCULIST') ?? rows[0];
            return <span style={{ fontSize: 13, lineHeight: 1.4 }}>{primary?.value ?? g.annotation}</span>;
          }} />
          <Row label="Annotations" tall render={(g, e) => (
            <div className="cmp-ann-list">
              {annotationRows(e, g.annotation).map((row) => (
                <div key={row.source}><span className="faint">{row.source}</span> {row.value}</div>
              ))}
            </div>
          )} />
          <Row label="Location" render={(g) => <span className="mono" style={{ fontSize: 12.5 }}>{fmtCoord(g.start)}–{fmtCoord(g.end)} {g.strand}</span>} />
          <Row label="Length" render={(g) => <span className="tabnum">{fmtInt(g.length)} aa · {fmtInt(g.bp)} bp</span>} />
          <Row label="pN/pS overall" render={(_, e) => <span className="tabnum">{formatPnps(e?.pnps?.overall)}</span>} />
          <Row label="pN/pS L1–L4" render={(_, e) => (
            <span className="tabnum dim" style={{ fontSize: 12 }}>
              {formatPnps(e?.pnps?.L1)} · {formatPnps(e?.pnps?.L2)} · {formatPnps(e?.pnps?.L3)} · {formatPnps(e?.pnps?.L4)}
            </span>
          )} />
          <Row label="Positive selection" render={(g, e) => {
            const d = derive(g);
            const under = e?.underSelection ?? (e?.omegaLower !== undefined ? e.omegaLower > 1 : d.positiveSelection.underSelection);
            const peak = e?.omegaPeak ?? d.positiveSelection.peakOmega;
            const lower = e?.omegaLower ?? d.positiveSelection.peakLowerCi;
            return <span><b>{under ? 'YES' : 'NO'}</b> · peak {peak} ({lower})</span>;
          }} />

          <div className="cmp-rowlabel" style={{ background: 'var(--panel-3)', textTransform: 'none', letterSpacing: 0, fontWeight: 700, color: 'var(--text)' }}>
            <span className="cmp-label-stack"><span>TMHMM</span><SourceBadge kind="reference" compact /></span>
          </div>
          {genes.map((g) => {
            const d = derive(g);
            return (
              <div key={g.orf} className="cmp-cell cmp-plot-cell">
                <PortalFigure
                  src={portalTmhmmUrl(g.orf)}
                  alt={`TMHMM for ${g.orf}`}
                  href={portalGenePage(g.orf)}
                  fallback={<TmhmmPlot profile={d.tmhmm} orf={g.orf} />}
                />
              </div>
            );
          })}

          <div className="cmp-rowlabel" style={{ background: 'var(--panel-3)', textTransform: 'none', letterSpacing: 0, fontWeight: 700, color: 'var(--text)' }}>
            <span className="cmp-label-stack"><span>Omega plot</span><SourceBadge kind="reference" compact /></span>
          </div>
          {genes.map((g) => {
            const d = derive(g);
            return (
              <div key={g.orf} className="cmp-cell cmp-plot-cell">
                <PortalFigure
                  src={portalOmegaPlotUrl(g.orf)}
                  alt={`Omega plot for ${g.orf}`}
                  href={portalOmegaPlotUrl(g.orf)}
                  fallback={<OmegaPlot series={d.positiveSelection.series} orf={g.orf} />}
                />
              </div>
            );
          })}

          <Row label="Sequence" tall render={(_, e) => (
            e?.sequence
              ? <pre className="seq cmp-seq">{e.sequence.length > 180 ? `${e.sequence.slice(0, 180)}…` : e.sequence}</pre>
              : <span className="faint">Not cached</span>
          )} />

          <Row label="Resources" render={(g) => (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <a className="chip" href={portalGenePage(g.orf)} target="_blank" rel="noopener noreferrer">Portal <ExternalLink size={11} /></a>
              <a className="chip" href={portalVariantsUrl(g.orf)} target="_blank" rel="noopener noreferrer">Variants <ExternalLink size={11} /></a>
              <a className="chip" href={href(`gene/${g.orf}`)}>Full page</a>
            </div>
          )} />
        </div>
      </div>
    </div>
  );
}
