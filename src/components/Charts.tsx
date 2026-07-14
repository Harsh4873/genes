import type { ExpressionPoint, EssentialityRow, Gene, DerivedGene } from '../lib/types';
import { category } from '../lib/categories';
import { fmtSigned } from '../lib/format';

// Expression cells recede to the panel background at log2fc≈0 and gain a red
// (up) or blue (down) overlay with magnitude — so the same scale reads on both
// light and dark surfaces without hard-coding a theme.
const UP = '#e5484d';
const DOWN = '#3b76ef';

export function exprOverlay(v: number, maxAbs = 4): { color: string; opacity: number } {
  const m = Math.min(Math.abs(v) / maxAbs, 1);
  return { color: v >= 0 ? UP : DOWN, opacity: Number((m * 0.92).toFixed(3)) };
}

export function HeatCell({ v, size = 22, title }: { v: number; size?: number; title?: string }) {
  const o = exprOverlay(v);
  return (
    <svg width={size} height={size} style={{ display: 'block' }} role="img" aria-label={title}>
      {title ? <title>{title}</title> : null}
      <rect x={0.5} y={0.5} width={size - 1} height={size - 1} rx={4} style={{ fill: 'var(--panel-2)', stroke: 'var(--border)' }} strokeWidth={1} />
      <rect x={0.5} y={0.5} width={size - 1} height={size - 1} rx={4} style={{ fill: o.color }} fillOpacity={o.opacity} />
    </svg>
  );
}

export function ExpressionStrip({ points, cell = 22, gap = 3 }: { points: ExpressionPoint[]; cell?: number; gap?: number }) {
  return (
    <div style={{ display: 'flex', gap, flexWrap: 'wrap' }}>
      {points.map((p) => (
        <div key={p.conditionId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: cell }}>
          <HeatCell v={p.log2fc} size={cell} title={`${p.label}: ${fmtSigned(p.log2fc)} log₂FC`} />
        </div>
      ))}
    </div>
  );
}

export function ExpressionBars({ points, maxAbs = 6 }: { points: ExpressionPoint[]; maxAbs?: number }) {
  const rowH = 26;
  const groupH = 18;
  const width = 460;
  const mid = width * 0.5;
  const half = width * 0.46;

  // Keep condition order, but insert a group header row when the group changes.
  type Row = { kind: 'group'; label: string } | { kind: 'point'; point: ExpressionPoint };
  const rows: Row[] = [];
  let lastGroup = '';
  for (const p of points) {
    if (p.group !== lastGroup) {
      rows.push({ kind: 'group', label: p.group });
      lastGroup = p.group;
    }
    rows.push({ kind: 'point', point: p });
  }

  let yCursor = 6;
  const layout = rows.map((row) => {
    const y = yCursor;
    yCursor += row.kind === 'group' ? groupH : rowH;
    return { row, y };
  });
  const height = yCursor + 22;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Expression fold-change by condition">
      <line x1={mid} y1={4} x2={mid} y2={yCursor} style={{ stroke: 'var(--border-strong)' }} strokeWidth={1} />
      <text x={mid - half} y={height - 4} textAnchor="middle" style={{ fill: 'var(--text-faint)', fontSize: 10 }}>{`-${maxAbs}`}</text>
      <text x={mid} y={height - 4} textAnchor="middle" style={{ fill: 'var(--text-faint)', fontSize: 10 }}>0</text>
      <text x={mid + half} y={height - 4} textAnchor="middle" style={{ fill: 'var(--text-faint)', fontSize: 10 }}>{`+${maxAbs}`}</text>
      {layout.map(({ row, y }) => {
        if (row.kind === 'group') {
          return (
            <text key={`g-${row.label}`} x={8} y={y + 12} style={{ fill: 'var(--text)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em' }}>
              {row.label.toUpperCase()}
            </text>
          );
        }
        const p = row.point;
        const w = Math.min(Math.abs(p.log2fc) / maxAbs, 1) * half;
        const up = p.log2fc >= 0;
        return (
          <g key={p.conditionId}>
            <title>{`${p.label}: ${fmtSigned(p.log2fc)} log₂FC`}</title>
            <rect x={up ? mid : mid - w} y={y} width={Math.max(w, 1)} height={rowH - 12} rx={3} style={{ fill: up ? UP : DOWN }} fillOpacity={0.85} />
            <text x={8} y={y + (rowH - 12) / 2 + 4} style={{ fill: 'var(--text-dim)', fontSize: 11 }}>{p.label}</text>
            <text x={width - 6} y={y + (rowH - 12) / 2 + 4} textAnchor="end" style={{ fill: 'var(--text-faint)', fontSize: 10.5, fontVariantNumeric: 'tabular-nums' }}>{fmtSigned(p.log2fc)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Compact top induced / repressed callouts for a gene profile. */
export function ExpressionHighlights({ points, limit = 3 }: { points: ExpressionPoint[]; limit?: number }) {
  const ranked = [...points].sort((a, b) => Math.abs(b.log2fc) - Math.abs(a.log2fc));
  const up = ranked.filter((p) => p.log2fc > 0).slice(0, limit);
  const down = ranked.filter((p) => p.log2fc < 0).slice(0, limit);
  return (
    <div className="expr-highlights" aria-label="Strongest transcriptional responses">
      <div>
        <div className="expr-hl-title" style={{ color: UP }}>Strongest induction</div>
        {up.length ? up.map((p) => (
          <div key={p.conditionId} className="expr-hl-row">
            <span>{p.label}</span>
            <span className="tabnum mono" style={{ color: UP }}>{fmtSigned(p.log2fc)}</span>
          </div>
        )) : <div className="faint" style={{ fontSize: 12.5 }}>No strong up-regulation</div>}
      </div>
      <div>
        <div className="expr-hl-title" style={{ color: DOWN }}>Strongest repression</div>
        {down.length ? down.map((p) => (
          <div key={p.conditionId} className="expr-hl-row">
            <span>{p.label}</span>
            <span className="tabnum mono" style={{ color: DOWN }}>{fmtSigned(p.log2fc)}</span>
          </div>
        )) : <div className="faint" style={{ fontSize: 12.5 }}>No strong down-regulation</div>}
      </div>
    </div>
  );
}

/** Horizontal stacked bar of essentiality calls across studies. */
export function EssentialityConsensus({ rows }: { rows: EssentialityRow[] }) {
  const order = ['essential', 'growth-defect', 'non-essential', 'uncertain', 'no-data'] as const;
  const counts = Object.fromEntries(order.map((k) => [k, 0])) as Record<string, number>;
  for (const r of rows) counts[r.call] = (counts[r.call] ?? 0) + 1;
  const total = rows.length || 1;
  const labels: Record<string, string> = {
    essential: 'Essential',
    'growth-defect': 'Growth-defect',
    'non-essential': 'Non-essential',
    uncertain: 'Uncertain',
    'no-data': 'No data',
  };
  return (
    <div className="ess-consensus" role="img" aria-label="Essentiality call distribution across studies">
      <div className="ess-consensus-bar">
        {order.map((call) => {
          const n = counts[call];
          if (!n) return null;
          return (
            <div
              key={call}
              className="ess-consensus-seg"
              style={{ width: `${(n / total) * 100}%`, background: ESS_COLOR[call] }}
              title={`${labels[call]}: ${n}/${total}`}
            />
          );
        })}
      </div>
      <div className="ess-consensus-legend">
        {order.map((call) => {
          const n = counts[call];
          if (!n) return null;
          return (
            <span key={call} className="ess-consensus-item">
              <span className="dot dot-round" style={{ background: ESS_COLOR[call], width: 8, height: 8 }} />
              {labels[call]} <span className="tabnum faint">{n}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Gene position on the H37Rv chromosome. */
export function ChromosomeLocus({
  start,
  end,
  genomeEnd,
  label,
}: {
  start: number;
  end: number;
  genomeEnd: number;
  label: string;
}) {
  const W = 640;
  const H = 54;
  const pad = 12;
  const trackY = 28;
  const span = Math.max(1, genomeEnd);
  const x1 = pad + (Math.min(start, end) / span) * (W - 2 * pad);
  const x2 = pad + (Math.max(start, end) / span) * (W - 2 * pad);
  const mid = (x1 + x2) / 2;
  const pct = ((Math.min(start, end) / span) * 100).toFixed(1);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} at ${pct}% of the chromosome`}>
      <text x={pad} y={14} style={{ fill: 'var(--text-faint)', fontSize: 10 }}>oriC</text>
      <text x={W - pad} y={14} textAnchor="end" style={{ fill: 'var(--text-faint)', fontSize: 10 }}>ter</text>
      <line x1={pad} y1={trackY} x2={W - pad} y2={trackY} style={{ stroke: 'var(--border-strong)' }} strokeWidth={3} strokeLinecap="round" />
      <rect x={Math.min(x1, x2) - 2} y={trackY - 9} width={Math.max(6, Math.abs(x2 - x1) + 4)} height={18} rx={4} style={{ fill: 'var(--accent)' }} fillOpacity={0.9} />
      <text x={mid} y={trackY + 22} textAnchor="middle" style={{ fill: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--mono)' }}>
        {label} · {pct}%
      </text>
    </svg>
  );
}

/** Horizontal property meters with numeric labels. */
export function PropertyBars({
  items,
}: {
  items: { label: string; value: number; max?: number; color?: string; display: string }[];
}) {
  return (
    <div className="property-bars">
      {items.map((item) => (
        <div key={item.label} className="property-bar-row">
          <div className="property-bar-meta">
            <span>{item.label}</span>
            <span className="tabnum mono faint">{item.display}</span>
          </div>
          <Meter value={item.value} max={item.max ?? 1} color={item.color} label={item.label} />
        </div>
      ))}
    </div>
  );
}

/** Mini insertion-density sketch for TnSeq context. */
export function TnSeqSketch({ saturation, taSites, essential }: { saturation: number; taSites: number; essential: boolean }) {
  const bars = 28;
  const height = 44;
  const width = 280;
  const gap = 2;
  const barW = (width - (bars - 1) * gap) / bars;
  // Deterministic-looking density from saturation: essential genes look sparse.
  const dens = essential ? saturation * 0.55 : saturation;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`TnSeq insertion sketch, ${Math.round(saturation * 100)}% saturation across ${taSites} TA sites`}>
      {Array.from({ length: bars }, (_, i) => {
        const seed = ((i * 17 + Math.round(dens * 100)) % 13) / 13;
        const present = seed < dens + 0.08;
        const h = present ? 10 + seed * 26 : 4;
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={height - h}
            width={barW}
            height={h}
            rx={1.5}
            style={{ fill: present ? 'var(--accent)' : 'var(--panel-3)' }}
            fillOpacity={present ? 0.75 : 1}
          />
        );
      })}
    </svg>
  );
}

export function Sparkline({ values, width = 120, height = 30 }: { values: number[]; width?: number; height?: number }) {
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));
  const step = width / Math.max(1, values.length - 1);
  const y = (v: number) => height / 2 - (v / maxAbs) * (height / 2 - 2);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} role="img" aria-label="Expression sparkline">
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} style={{ stroke: 'var(--border)' }} strokeWidth={1} />
      <path d={d} fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Donut({ data, size = 200, thickness = 26, onSlice }: { data: { label: string; value: number; color: string }[]; size?: number; thickness?: number; onSlice?: (label: string) => void }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = size / 2 - thickness / 2 - 1;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Functional class distribution">
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        {data.map((d) => {
          const frac = d.value / total;
          const dash = frac * circ;
          const label = `${d.label}: ${d.value} (${(frac * 100).toFixed(1)}%)`;
          const el = (
            <circle
              key={d.label}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              style={{ cursor: onSlice ? 'pointer' : 'default', transition: 'stroke-width 0.15s' }}
              role={onSlice ? 'button' : undefined}
              tabIndex={onSlice ? 0 : undefined}
              aria-label={label}
              onClick={onSlice ? () => onSlice(d.label) : undefined}
              onKeyDown={onSlice ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSlice(d.label);
                }
              } : undefined}
            >
              <title>{label}</title>
            </circle>
          );
          offset += dash;
          return el;
        })}
      </g>
      <text x={cx} y={cy - 4} textAnchor="middle" style={{ fill: 'var(--text)', fontSize: 22, fontWeight: 750 }}>{total.toLocaleString()}</text>
      <text x={cx} y={cy + 15} textAnchor="middle" style={{ fill: 'var(--text-dim)', fontSize: 11 }}>genes</text>
    </svg>
  );
}

const ESS_COLOR: Record<string, string> = {
  essential: 'var(--ess-essential)',
  'growth-defect': 'var(--ess-defect)',
  'non-essential': 'var(--ess-nonessential)',
  uncertain: 'var(--ess-uncertain)',
  'no-data': 'var(--ess-uncertain)',
};

export function EssentialityDots({ rows }: { rows: EssentialityRow[] }) {
  const summary = rows.map((r) => `${r.ref}: ${r.call}`).join('; ');
  return (
    <div style={{ display: 'flex', gap: 5 }} role="img" aria-label={`Essentiality calls. ${summary}`}>
      {rows.map((r) => (
        <span key={r.datasetId} title={`${r.ref} — ${r.condition}: ${r.call}`}
          aria-hidden="true"
          className="dot dot-round" style={{ background: ESS_COLOR[r.call], width: 11, height: 11, opacity: r.call === 'no-data' ? 0.3 : 1 }} />
      ))}
    </div>
  );
}

export function Meter({ value, max = 1, color = 'var(--accent)', height = 8, label = 'Meter value' }: { value: number; max?: number; color?: string; height?: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div
      style={{ background: 'var(--panel-3)', borderRadius: 999, height, overflow: 'hidden' }}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Number(value.toFixed(3))}
    >
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999, transition: 'width 0.3s' }} />
    </div>
  );
}

// Neighbouring genes drawn to genomic scale, focus gene highlighted.
export function GenomeContext({ neighbors, focusOrf, onPick }: { neighbors: Gene[]; focusOrf: string; onPick?: (orf: string) => void }) {
  if (!neighbors.length) return null;
  const min = Math.min(...neighbors.map((g) => Math.min(g.start, g.end)));
  const max = Math.max(...neighbors.map((g) => Math.max(g.start, g.end)));
  const span = Math.max(1, max - min);
  const W = 900;
  const H = 76;
  const pad = 10;
  const x = (bp: number) => pad + ((bp - min) / span) * (W - 2 * pad);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Genomic neighbourhood" style={{ minWidth: 520 }}>
      <line x1={pad} y1={H / 2} x2={W - pad} y2={H / 2} style={{ stroke: 'var(--border-strong)' }} strokeWidth={1.5} />
      {neighbors.map((g) => {
        const x1 = x(Math.min(g.start, g.end));
        const x2 = x(Math.max(g.start, g.end));
        const w = Math.max(6, x2 - x1);
        const focus = g.orf === focusOrf;
        const up = g.strand === '+';
        const arrow = 6;
        const y = up ? H / 2 - 20 : H / 2 + 2;
        const col = category(g.category).color;
        const path = up
          ? `M${x1},${y} H${x1 + w - arrow} L${x1 + w},${y + 9} L${x1 + w - arrow},${y + 18} H${x1} Z`
          : `M${x1 + w},${y} H${x1 + arrow} L${x1},${y + 9} L${x1 + arrow},${y + 18} H${x1 + w} Z`;
        const label = `${g.orf}${g.gene ? ` (${g.gene})` : ''}, ${g.strand} strand, ${g.annotation}`;
        return (
          <g
            key={g.orf}
            className="genome-neighbor"
            style={{ cursor: onPick ? 'pointer' : 'default' }}
            role={onPick ? 'button' : undefined}
            tabIndex={onPick ? 0 : undefined}
            aria-label={label}
            onClick={onPick ? () => onPick(g.orf) : undefined}
            onKeyDown={onPick ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPick(g.orf);
              }
            } : undefined}
          >
            <title>{label}</title>
            <path d={path} fill={col} fillOpacity={focus ? 1 : 0.5} stroke={focus ? 'var(--text)' : 'none'} strokeWidth={focus ? 1.5 : 0} />
            {w > 34 ? (
              <text x={x1 + w / 2} y={y + 12.5} textAnchor="middle" style={{ fill: focus ? 'var(--accent-contrast)' : 'var(--text)', fontSize: 9.5, fontWeight: focus ? 700 : 500, pointerEvents: 'none' }}>
                {g.gene ?? g.orf.replace('Rv', '')}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

const TM_COLORS = { transmembrane: '#d9480f', inside: '#1c7ed6', outside: '#c2255c' };

/** TMHMM-style posterior probability plot (portal fallback). */
export function TmhmmPlot({ profile, orf }: { profile: DerivedGene['tmhmm']; orf: string }) {
  const W = 560;
  const H = 280;
  const pad = { l: 48, r: 18, t: 36, b: 42 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const maxX = Math.max(1, profile.lengthAa);
  const yMax = 1.2;
  const x = (pos: number) => pad.l + (pos / maxX) * plotW;
  const y = (p: number) => pad.t + plotH - (p / yMax) * plotH;
  const pathFor = (key: 'transmembrane' | 'inside' | 'outside') =>
    profile.series.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.pos).toFixed(1)},${y(s[key]).toFixed(1)}`).join(' ');
  const topoY = pad.t + 8;
  const topoColor = TM_COLORS[profile.topology === 'transmembrane' ? 'transmembrane' : profile.topology];

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`TMHMM posterior probabilities for ${orf}`} className="portal-style-plot">
      <text x={W / 2} y={16} textAnchor="middle" style={{ fill: 'var(--text)', fontSize: 13, fontWeight: 700 }}>
        {`TMHMM posterior probabilities for ${orf}`}
      </text>
      <rect x={pad.l} y={pad.t} width={plotW} height={plotH} fill="var(--panel)" stroke="var(--border-strong)" />
      {[0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2].map((tick) => (
        <g key={tick}>
          <line x1={pad.l} y1={y(tick)} x2={pad.l + plotW} y2={y(tick)} style={{ stroke: 'var(--border)' }} strokeWidth={1} />
          <text x={pad.l - 8} y={y(tick) + 3} textAnchor="end" style={{ fill: 'var(--text-faint)', fontSize: 10 }}>{tick}</text>
        </g>
      ))}
      {Array.from({ length: Math.floor(maxX / 20) + 1 }, (_, i) => i * 20).filter((v) => v <= maxX).map((tick) => (
        <text key={tick} x={x(tick)} y={H - 14} textAnchor="middle" style={{ fill: 'var(--text-faint)', fontSize: 10 }}>{tick}</text>
      ))}
      <text x={14} y={pad.t + plotH / 2} textAnchor="middle" transform={`rotate(-90 14 ${pad.t + plotH / 2})`} style={{ fill: 'var(--text-dim)', fontSize: 11 }}>probability</text>
      <line x1={pad.l + 2} y1={topoY} x2={pad.l + plotW - 2} y2={topoY} stroke={topoColor} strokeWidth={8} strokeLinecap="round" />
      <path d={pathFor('outside')} fill="none" stroke={TM_COLORS.outside} strokeWidth={1.6} />
      <path d={pathFor('inside')} fill="none" stroke={TM_COLORS.inside} strokeWidth={1.6} />
      <path d={pathFor('transmembrane')} fill="none" stroke={TM_COLORS.transmembrane} strokeWidth={1.8} />
      <g transform={`translate(${pad.l}, ${H - 4})`} style={{ fontSize: 11 }}>
        <line x1={0} y1={-8} x2={18} y2={-8} stroke={TM_COLORS.transmembrane} strokeWidth={2} />
        <text x={22} y={-5} style={{ fill: 'var(--text-dim)' }}>transmembrane</text>
        <line x1={130} y1={-8} x2={148} y2={-8} stroke={TM_COLORS.inside} strokeWidth={2} />
        <text x={152} y={-5} style={{ fill: 'var(--text-dim)' }}>inside</text>
        <line x1={210} y1={-8} x2={228} y2={-8} stroke={TM_COLORS.outside} strokeWidth={2} />
        <text x={232} y={-5} style={{ fill: 'var(--text-dim)' }}>outside</text>
      </g>
    </svg>
  );
}

/** GenomegaMap-style omega (dN/dS) plot (portal fallback). */
export function OmegaPlot({ series, orf }: { series: DerivedGene['positiveSelection']['series']; orf: string }) {
  const W = 560;
  const H = 300;
  const pad = { l: 52, r: 18, t: 34, b: 44 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const maxX = Math.max(1, ...series.map((s) => s.codon));
  const dataMax = Math.max(1.5, ...series.map((s) => s.upper));
  const yMax = Math.min(10, Math.ceil(dataMax));
  const x = (codon: number) => pad.l + (codon / maxX) * plotW;
  const y = (v: number) => pad.t + plotH - (v / yMax) * plotH;
  const meanPath = series.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.codon).toFixed(1)},${y(s.mean).toFixed(1)}`).join(' ');
  const lowerPath = series.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.codon).toFixed(1)},${y(s.lower).toFixed(1)}`).join(' ');
  const upperPath = series.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.codon).toFixed(1)},${y(s.upper).toFixed(1)}`).join(' ');
  const yTicks = Array.from({ length: yMax + 1 }, (_, i) => i);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Omega dN/dS plot for ${orf}`} className="portal-style-plot">
      <text x={W / 2} y={18} textAnchor="middle" style={{ fill: 'var(--text)', fontSize: 13, fontWeight: 700 }}>{orf}</text>
      <rect x={pad.l} y={pad.t} width={plotW} height={plotH} fill="var(--panel)" stroke="var(--border-strong)" />
      {yTicks.map((tick) => (
        <g key={tick}>
          <line x1={pad.l} y1={y(tick)} x2={pad.l + plotW} y2={y(tick)} style={{ stroke: 'var(--border)' }} strokeWidth={1} />
          <text x={pad.l - 8} y={y(tick) + 3} textAnchor="end" style={{ fill: 'var(--text-faint)', fontSize: 10 }}>{tick}</text>
        </g>
      ))}
      {[0, 50, 100, 150, 200, 250, 300, 350, 400].filter((t) => t <= maxX).map((tick) => (
        <text key={tick} x={x(tick)} y={H - 16} textAnchor="middle" style={{ fill: 'var(--text-faint)', fontSize: 10 }}>{tick}</text>
      ))}
      <text x={14} y={pad.t + plotH / 2} textAnchor="middle" transform={`rotate(-90 14 ${pad.t + plotH / 2})`} style={{ fill: 'var(--text-dim)', fontSize: 11 }}>omega (dN/dS)</text>
      <text x={pad.l + plotW / 2} y={H - 4} textAnchor="middle" style={{ fill: 'var(--text-dim)', fontSize: 11 }}>codon</text>
      <line x1={pad.l} y1={y(1)} x2={pad.l + plotW} y2={y(1)} stroke="#e03131" strokeWidth={1.4} />
      <path d={upperPath} fill="none" stroke="#4dabf7" strokeWidth={1.3} strokeDasharray="4 3" />
      <path d={lowerPath} fill="none" stroke="#4dabf7" strokeWidth={1.3} strokeDasharray="4 3" />
      <path d={meanPath} fill="none" stroke="var(--text)" strokeWidth={1.7} />
    </svg>
  );
}

