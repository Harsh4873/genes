import { useMemo, useRef } from 'react';
import { Download } from 'lucide-react';
import type { SelectionGene } from '../lib/selection';
import { pnpsPair, type SelectionCall } from '../lib/selectionStats';
import type { SelectionPlotKind } from '../lib/selectionState';

// Plots are plain SVG so they scale, theme, and can be saved straight out of
// the page as a vector figure without a chart library.

const W = 760;
const H = 440;
const PAD = { top: 18, right: 20, bottom: 46, left: 62 };

export const CALL_COLOR: Record<SelectionCall, string> = {
  positive: 'var(--danger)',
  purifying: 'var(--info)',
  none: 'var(--text-faint)',
};

export interface PlotPoint {
  gene: SelectionGene;
  x: number;
  y: number;
  call: SelectionCall;
}

interface Axis {
  label: string;
  min: number;
  max: number;
  ticks: number[];
}

function niceTicks(min: number, max: number, count = 6): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const first = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = first; v <= max + step / 1000; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

function pad(min: number, max: number): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) return [min - 0.5, max + 0.5];
  const margin = (max - min) * 0.04;
  return [min - margin, max + margin];
}

export interface PlotSpec {
  points: PlotPoint[];
  xAxis: Axis;
  yAxis: Axis;
  caption: string;
  /** Reference lines drawn as dashes, in data coordinates. */
  guides: { axis: 'x' | 'y'; value: number; label: string }[];
}

export function buildPlot(
  genes: SelectionGene[],
  calls: Map<string, SelectionCall>,
  kind: SelectionPlotKind,
  thresholds: { dpdHigh: number; dpdLow: number },
): PlotSpec {
  const points: PlotPoint[] = [];
  for (const gene of genes) {
    const call = calls.get(gene.orf) ?? 'none';
    if (kind === 'dpd-delta') {
      const ratios = pnpsPair(gene);
      if (!ratios || gene.dpd === null) continue;
      points.push({ gene, x: ratios.deltaLog2, y: gene.dpd, call });
    } else if (kind === 'lrt-dpd') {
      if (gene.dpd === null || !gene.pamlFitted || gene.pamlSigned2LL === null) continue;
      points.push({ gene, x: gene.dpd, y: gene.pamlSigned2LL, call });
    } else {
      if (gene.omegaNdb === null || gene.omegaDb === null) continue;
      points.push({ gene, x: gene.omegaNdb, y: gene.omegaDb, call });
    }
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));

  if (kind === 'dpd-delta') {
    return {
      points,
      xAxis: { label: 'Δlog₂(pN/pS), diabetes − non-diabetes', min: x0, max: x1, ticks: niceTicks(x0, x1) },
      yAxis: { label: 'DPD  P(ω_DB > ω_NDB)', min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] },
      caption:
        'Every gene with both a posterior comparison and a pN/pS pair. The Bayesian comparison runs up the y axis, the count-based one across the x axis; genes near the top right are called by both.',
      guides: [
        { axis: 'y', value: thresholds.dpdHigh, label: `DPD ${thresholds.dpdHigh}` },
        { axis: 'y', value: thresholds.dpdLow, label: `DPD ${thresholds.dpdLow}` },
        { axis: 'x', value: 0, label: 'no difference' },
      ],
    };
  }

  if (kind === 'lrt-dpd') {
    return {
      points,
      xAxis: { label: 'DPD  P(ω_DB > ω_NDB)', min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] },
      yAxis: { label: 'signed 2ΔLL, branch model M2 vs M0', min: y0, max: y1, ticks: niceTicks(y0, y1) },
      caption:
        'The phylogenetic likelihood-ratio test against the Bayesian comparison, over the genes the branch model could fit. Beyond ±3.84 the two-ω model beats the one-ω model at α = 0.05.',
      guides: [
        { axis: 'y', value: 3.841459, label: '2ΔLL 3.84' },
        { axis: 'y', value: -3.841459, label: '−3.84' },
        { axis: 'x', value: thresholds.dpdHigh, label: `DPD ${thresholds.dpdHigh}` },
      ],
    };
  }

  return {
    points,
    xAxis: { label: 'posterior mean ω, non-diabetes', min: x0, max: x1, ticks: niceTicks(x0, x1) },
    yAxis: { label: 'posterior mean ω, diabetes', min: y0, max: y1, ticks: niceTicks(y0, y1) },
    caption:
      'Posterior mean ω in one cohort against the other. Points above the diagonal carry more nonsynonymous change per synonymous change in the diabetes cohort.',
    guides: [
      { axis: 'x', value: 1, label: 'ω = 1' },
      { axis: 'y', value: 1, label: 'ω = 1' },
    ],
  };
}

export function SelectionScatter({
  spec,
  focus,
  onPick,
  labelled,
}: {
  spec: PlotSpec;
  focus: string | null;
  onPick: (orf: string) => void;
  /** Genes to print a symbol beside, normally the current call set. */
  labelled: Set<string>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const sx = (v: number) => PAD.left + ((v - spec.xAxis.min) / (spec.xAxis.max - spec.xAxis.min)) * innerW;
  const sy = (v: number) => PAD.top + innerH - ((v - spec.yAxis.min) / (spec.yAxis.max - spec.yAxis.min)) * innerH;

  // Draw the unremarkable genes first so calls and the focused gene sit on top.
  const ordered = useMemo(() => {
    const rank = (p: PlotPoint) => (p.gene.orf === focus ? 3 : p.call !== 'none' ? 2 : 1);
    return [...spec.points].sort((a, b) => rank(a) - rank(b));
  }, [spec.points, focus]);

  // Label the called genes, dropping any symbol that would collide with one
  // already placed rather than stacking them into an unreadable clump.
  const placed = useMemo(() => {
    const out: { point: PlotPoint; x: number; y: number }[] = [];
    const taken: { x: number; y: number; w: number }[] = [];
    // Reserve the space the guide labels already occupy.
    for (const guide of spec.guides) {
      const w = guide.label.length * 5.6 + 8;
      if (guide.axis === 'y') taken.push({ x: PAD.left + innerW - 4 - w, y: sy(guide.value) - 5, w });
      else taken.push({ x: sx(guide.value) + 4, y: PAD.top + 12, w });
    }
    const candidates = ordered
      .filter((point) => labelled.has(point.gene.orf) && point.gene.gene)
      .reverse();
    for (const point of candidates) {
      if (out.length >= 24) break;
      const w = (point.gene.gene as string).length * 5.6 + 8;
      // A ladder of slots around the point: right first, then left, then
      // progressively further above and below.
      const offsets = [
        [8, 3.5],
        [-w - 5, 3.5],
        [8, -10],
        [-w - 5, -10],
        [8, 17],
        [-w - 5, 17],
        [8, -23],
        [8, 30],
      ];
      for (const [dx, dy] of offsets) {
        const x = sx(point.x) + dx;
        const y = sy(point.y) + dy;
        if (x < PAD.left || x + w > PAD.left + innerW || y < PAD.top + 8 || y > PAD.top + innerH) continue;
        const clash = taken.some((slot) => Math.abs(slot.y - y) < 11 && x < slot.x + slot.w && slot.x < x + w);
        if (clash) continue;
        taken.push({ x, y, w });
        out.push({ point, x, y });
        break;
      }
    }
    return out;
  }, [ordered, labelled, spec]);

  const download = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // Inline the theme so the saved figure does not depend on the page.
    const styles = getComputedStyle(document.documentElement);
    const resolve = (node: Element) => {
      for (const attribute of ['fill', 'stroke']) {
        const value = node.getAttribute(attribute);
        const match = value && /^var\((--[\w-]+)\)$/.exec(value);
        if (match) node.setAttribute(attribute, styles.getPropertyValue(match[1]).trim() || '#666');
      }
      for (const child of Array.from(node.children)) resolve(child);
    };
    resolve(clone);
    const blob = new Blob([clone.outerHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mtbscope-selection.svg';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="selection-plot">
      <div className="selection-plot-head">
        <p className="dim" style={{ margin: 0, fontSize: 13, maxWidth: 640 }}>{spec.caption}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={download} title="Save this figure as SVG">
          <Download size={14} /> SVG
        </button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="selection-svg"
        role="img"
        aria-label={`${spec.yAxis.label} against ${spec.xAxis.label}, ${spec.points.length} genes`}
      >
        <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} fill="var(--panel-2)" opacity={0.5} />
        {spec.xAxis.ticks.map((t) => (
          <g key={`x${t}`}>
            <line x1={sx(t)} y1={PAD.top} x2={sx(t)} y2={PAD.top + innerH} stroke="var(--border)" strokeWidth={1} />
            <text x={sx(t)} y={PAD.top + innerH + 18} textAnchor="middle" fontSize={11} fill="var(--text-faint)">
              {t}
            </text>
          </g>
        ))}
        {spec.yAxis.ticks.map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.left} y1={sy(t)} x2={PAD.left + innerW} y2={sy(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 8} y={sy(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-faint)">
              {t}
            </text>
          </g>
        ))}
        {spec.guides.map((guide) =>
          guide.axis === 'y' ? (
            <g key={`g${guide.label}`}>
              <line
                x1={PAD.left}
                y1={sy(guide.value)}
                x2={PAD.left + innerW}
                y2={sy(guide.value)}
                stroke="var(--accent)"
                strokeWidth={1}
                strokeDasharray="5 4"
              />
              <text x={PAD.left + innerW - 4} y={sy(guide.value) - 5} textAnchor="end" fontSize={10.5} fill="var(--accent)">
                {guide.label}
              </text>
            </g>
          ) : (
            <g key={`g${guide.label}`}>
              <line
                x1={sx(guide.value)}
                y1={PAD.top}
                x2={sx(guide.value)}
                y2={PAD.top + innerH}
                stroke="var(--accent)"
                strokeWidth={1}
                strokeDasharray="5 4"
              />
              <text x={sx(guide.value) + 4} y={PAD.top + 12} fontSize={10.5} fill="var(--accent)">
                {guide.label}
              </text>
            </g>
          ),
        )}
        {ordered.map((point) => {
          const isFocus = point.gene.orf === focus;
          const r = isFocus ? 6 : point.call === 'none' ? 2 : 4;
          return (
            <circle
              key={point.gene.orf}
              cx={sx(point.x)}
              cy={sy(point.y)}
              r={r}
              fill={isFocus ? 'var(--accent)' : CALL_COLOR[point.call]}
              fillOpacity={point.call === 'none' && !isFocus ? 0.4 : 0.9}
              stroke={isFocus ? 'var(--text)' : 'none'}
              strokeWidth={isFocus ? 1.5 : 0}
              className="selection-dot"
              onClick={() => onPick(point.gene.orf)}
            >
              <title>{`${point.gene.name} — ${spec.xAxis.label.split(' ')[0]} ${point.x.toFixed(3)}, ${spec.yAxis.label.split(' ')[0]} ${point.y.toFixed(3)}`}</title>
            </circle>
          );
        })}
        {placed.map(({ point, x, y }) => (
          <text
            key={`l${point.gene.orf}`}
            x={x}
            y={y}
            fontSize={10.5}
            fill="var(--text-dim)"
            stroke="var(--panel)"
            strokeWidth={3}
            paintOrder="stroke"
            pointerEvents="none"
          >
            {point.gene.gene}
          </text>
        ))}
        <text x={PAD.left + innerW / 2} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--text-dim)">
          {spec.xAxis.label}
        </text>
        <text
          x={14}
          y={PAD.top + innerH / 2}
          textAnchor="middle"
          fontSize={12}
          fill="var(--text-dim)"
          transform={`rotate(-90 14 ${PAD.top + innerH / 2})`}
        >
          {spec.yAxis.label}
        </text>
      </svg>
    </div>
  );
}

/** Two posterior means with their 95% credible intervals on a shared scale. */
export function OmegaIntervals({ gene }: { gene: SelectionGene }) {
  const values = [gene.omegaDbLo, gene.omegaDbHi, gene.omegaNdbLo, gene.omegaNdbHi, 1].filter(
    (v): v is number => v !== null,
  );
  if (!values.length || gene.omegaDb === null || gene.omegaNdb === null) return null;
  const max = Math.max(...values) * 1.05;
  const width = 340;
  const height = 92;
  const scale = (v: number) => (v / max) * width;

  const rows: { label: string; mean: number; lo: number | null; hi: number | null; color: string }[] = [
    { label: 'Diabetes', mean: gene.omegaDb, lo: gene.omegaDbLo, hi: gene.omegaDbHi, color: 'var(--danger)' },
    { label: 'Non-diabetes', mean: gene.omegaNdb, lo: gene.omegaNdbLo, hi: gene.omegaNdbHi, color: 'var(--info)' },
  ];

  return (
    <svg viewBox={`0 0 ${width + 96} ${height}`} className="omega-intervals" role="img" aria-label="Posterior mean omega with 95% credible intervals">
      <line x1={82 + scale(1)} y1={6} x2={82 + scale(1)} y2={height - 22} stroke="var(--border-strong)" strokeDasharray="4 3" />
      <text x={82 + scale(1)} y={height - 8} fontSize={10.5} fill="var(--text-faint)" textAnchor="middle">
        ω = 1
      </text>
      {rows.map((row, index) => {
        const y = 22 + index * 30;
        return (
          <g key={row.label}>
            <text x={76} y={y + 4} fontSize={11.5} fill="var(--text-dim)" textAnchor="end">
              {row.label}
            </text>
            {row.lo !== null && row.hi !== null ? (
              <line x1={82 + scale(row.lo)} y1={y} x2={82 + scale(row.hi)} y2={y} stroke={row.color} strokeWidth={3} strokeOpacity={0.35} strokeLinecap="round" />
            ) : null}
            <circle cx={82 + scale(row.mean)} cy={y} r={4.5} fill={row.color} />
          </g>
        );
      })}
    </svg>
  );
}

/** Stacked cohort share for one facet of the collection. */
export function CohortBar({ db, ndb }: { db: number; ndb: number }) {
  const total = db + ndb || 1;
  return (
    <div className="cohort-bar" title={`${db} diabetes, ${ndb} non-diabetes`}>
      <span style={{ width: `${(db / total) * 100}%`, background: 'var(--danger)' }} />
      <span style={{ width: `${(ndb / total) * 100}%`, background: 'var(--info)' }} />
    </div>
  );
}
