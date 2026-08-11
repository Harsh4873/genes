import type { DerivedGene } from '../lib/types';

// Fold-change overlay colors: a cell recedes to the panel background at
// log2fc≈0 and gains a red (up) or blue (down) overlay with magnitude — so the
// same scale reads on both light and dark surfaces without hard-coding a theme.
const UP = '#e5484d';
const DOWN = '#3b76ef';

export function exprOverlay(v: number, maxAbs = 4): { color: string; opacity: number } {
  const m = Math.min(Math.abs(v) / maxAbs, 1);
  return { color: v >= 0 ? UP : DOWN, opacity: Number((m * 0.92).toFixed(3)) };
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
