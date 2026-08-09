// GenePrioritize: rank the genome by how much a gene is worth investigating.
//
// Every signal is scaled to 0-1 and the score is the weighted mean over the
// signals that HAVE DATA for that gene. Treating an unmeasured signal as zero
// would rank a well-characterised gene below one nobody has measured, which is
// exactly backwards, so missing signals leave both the numerator and the
// denominator and are reported per gene instead.
//
// Only measured quantities feed the ranking:
//   - the diabetes selection dataset (lib/selection.ts), when unlocked
//   - the TB Genome Portal enrichment: Culviner lineage pN/pS, omega peak, and
//     the five independent annotation sources (lib/portalEnrichment.ts)
//   - Europe PMC hit counts (lib/literature.ts)
//   - the catalog's functional class
//
// Nothing from lib/derive.ts is used. That module is deterministic
// demonstration data, not measurement, and ranking real research priorities on
// synthetic numbers would be worse than not ranking at all.

import type { CategoryId, Gene } from './types';
import type { SelectionGene } from './selection';
import type { PortalGeneEnrichment } from './portalEnrichment';

export const SIGNALS = [
  'selection',
  'significance',
  'mutations',
  'cohort',
  'lineage',
  'literature',
  'pathway',
  'annotation',
] as const;

export type SignalId = (typeof SIGNALS)[number];

export type Weights = Record<SignalId, number>;

export interface SignalMeta {
  id: SignalId;
  label: string;
  short: string;
  help: string;
  /** True when the signal comes from the locked diabetes dataset. */
  locked: boolean;
}

export const SIGNAL_META: SignalMeta[] = [
  {
    id: 'selection',
    label: 'Selection strength (ω)',
    short: 'ω',
    help: 'Posterior mean ω in the diabetes cohort, and the probability it exceeds the non-diabetes cohort (DPD).',
    locked: true,
  },
  {
    id: 'significance',
    label: 'Statistical significance',
    short: 'sig',
    help: 'Branch-model 2ΔlnL signed towards diabetes, backed by the Pearson chi-square on the same counts.',
    locked: true,
  },
  {
    id: 'mutations',
    label: 'Mutation count',
    short: 'mut',
    help: 'Distinct alleles seen across the pooled isolates. More segregating variation means more to explain.',
    locked: true,
  },
  {
    id: 'cohort',
    label: 'Cohort difference',
    short: 'coh',
    help: 'Published Δlog₂(pN/pS) between the diabetes and non-diabetes cohorts.',
    locked: true,
  },
  {
    id: 'lineage',
    label: 'Lineage selection',
    short: 'lin',
    help: 'Culviner lineage pN/pS and the GenomegaMap ω peak from the TB Genome Portal. Independent of the diabetes study.',
    locked: false,
  },
  {
    id: 'literature',
    label: 'Literature volume',
    short: 'lit',
    help: 'Europe PMC papers naming the gene in title or abstract. Fetch it below; genes not fetched stay unscored on this signal.',
    locked: false,
  },
  {
    id: 'pathway',
    label: 'Pathway interest',
    short: 'path',
    help: 'Whether the gene falls in a functional class you selected.',
    locked: false,
  },
  {
    id: 'annotation',
    label: 'Annotation confidence',
    short: 'ann',
    help: 'How far five independent annotation sources agree on what this gene does, and how hedged the wording is.',
    locked: false,
  },
];

export const DEFAULT_WEIGHTS: Weights = {
  selection: 1,
  significance: 1,
  mutations: 0.75,
  cohort: 0.5,
  lineage: 0.75,
  literature: 0.25,
  pathway: 0.5,
  annotation: 0.25,
};

export const DEFAULT_PATHWAYS: CategoryId[] = ['cell-wall', 'virulence', 'lipid'];

/** Squash an unbounded positive quantity into 0-1, with `mid` landing at 0.5. */
function saturate(value: number, mid: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value / (value + mid);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

const HEDGE = /\b(probable|possible|putative|predicted|conserved hypothetical|hypothetical|unknown|uncharacteri[sz]ed)\b/i;

/** Normalise an annotation string enough to tell agreement from disagreement. */
function annotationKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(probable|possible|putative|predicted|conserved|protein|putatively)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Annotation confidence from cross-source agreement.
 *
 * A gene five databases describe the same way is genuinely characterised; one
 * where they disagree, or where every source hedges, is not. Agreement is the
 * dominant term, hedging and emptiness pull it down.
 */
export function annotationConfidence(gene: Gene, enrichment?: PortalGeneEnrichment | null): number {
  const sources = enrichment?.annotations ?? {};
  const values = [sources.TBDB, sources.REFSEQ, sources.PATRIC, sources.TUBERCULIST, sources.NCBI]
    .map((v) => (v ?? '').trim())
    .filter(Boolean);

  if (!values.length) {
    // No enrichment: fall back to reading the catalog annotation alone.
    const text = gene.annotation.trim();
    if (!text || /^conserved hypothetical|^hypothetical|^unknown/i.test(text)) return 0.05;
    return HEDGE.test(text) ? 0.4 : 0.75;
  }

  const keys = values.map(annotationKey).filter(Boolean);
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  const agreement = keys.length ? Math.max(...counts.values()) / keys.length : 0;

  const hedged = values.filter((v) => HEDGE.test(v)).length / values.length;
  const coverage = values.length / 5;

  // Agreement carries the score; hedging discounts it; thin coverage caps it.
  return clamp01(agreement * (1 - 0.55 * hedged) * (0.6 + 0.4 * coverage));
}

export interface SignalValue {
  id: SignalId;
  /** 0-1, or null when nothing measured this signal for this gene. */
  value: number | null;
}

export interface RankedGene {
  gene: Gene;
  score: number;
  signals: SignalValue[];
  missing: SignalId[];
  selection: SelectionGene | null;
  literature: number | null;
}

export interface RankInput {
  genes: Gene[];
  selection?: Map<string, SelectionGene> | null;
  enrichment?: Map<string, PortalGeneEnrichment> | null;
  literature?: Map<string, number> | null;
  weights: Weights;
  pathways?: CategoryId[];
}

function selectionSignal(row: SelectionGene | null): number | null {
  if (!row) return null;
  const parts: number[] = [];
  if (row.omegaDb !== null) parts.push(saturate(row.omegaDb, 1));
  if (row.dpd !== null) parts.push(clamp01(row.dpd));
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}

function significanceSignal(row: SelectionGene | null): number | null {
  if (!row) return null;
  const parts: number[] = [];
  // 2dLL of 3.84 is the nominal 5% point on 1 df; that lands mid-scale.
  if (row.pamlSigned2LL !== null) parts.push(saturate(Math.max(row.pamlSigned2LL, 0), 3.84));
  if (row.chiSq !== null) parts.push(saturate(row.chiSq, 3.84));
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}

function lineageSignal(enrichment: PortalGeneEnrichment | null | undefined): number | null {
  if (!enrichment) return null;
  const parts: number[] = [];
  // pN/pS of 1 is neutrality; above it is the interesting direction.
  if (typeof enrichment.pnps?.overall === 'number') parts.push(saturate(enrichment.pnps.overall, 1));
  if (typeof enrichment.omegaPeak === 'number') parts.push(saturate(enrichment.omegaPeak, 1));
  if (!parts.length) return null;
  const mean = parts.reduce((a, b) => a + b, 0) / parts.length;
  // A portal call of "under selection" is a real, independent verdict.
  return clamp01(enrichment.underSelection ? Math.min(1, mean + 0.15) : mean);
}

export function rankGenes(input: RankInput): RankedGene[] {
  const { genes, selection, enrichment, literature, weights } = input;
  const pathways = new Set<CategoryId>(input.pathways ?? []);

  const ranked = genes.map((gene): RankedGene => {
    const row = selection?.get(gene.orf) ?? null;
    const portal = enrichment?.get(gene.orf) ?? null;
    const papers = literature?.get(gene.orf) ?? null;

    const values: Record<SignalId, number | null> = {
      selection: selectionSignal(row),
      significance: significanceSignal(row),
      mutations: row?.alleles !== null && row?.alleles !== undefined ? saturate(row.alleles, 20) : null,
      cohort:
        row?.publishedDeltaLog2 !== null && row?.publishedDeltaLog2 !== undefined
          ? saturate(Math.abs(row.publishedDeltaLog2), 1)
          : null,
      lineage: lineageSignal(portal),
      literature: papers === null ? null : saturate(papers, 40),
      pathway: pathways.size ? (pathways.has(gene.category) ? 1 : 0) : null,
      annotation: annotationConfidence(gene, portal),
    };

    let weighted = 0;
    let total = 0;
    const missing: SignalId[] = [];
    for (const id of SIGNALS) {
      const value = values[id];
      if (value === null) {
        missing.push(id);
        continue;
      }
      const weight = weights[id] ?? 0;
      weighted += value * weight;
      total += weight;
    }

    return {
      gene,
      score: total > 0 ? (weighted / total) * 100 : 0,
      signals: SIGNALS.map((id) => ({ id, value: values[id] })),
      missing,
      selection: row,
      literature: papers,
    };
  });

  ranked.sort((a, b) => b.score - a.score || a.gene.orf.localeCompare(b.gene.orf));
  return ranked;
}

/** Weights survive in the URL, so a ranking can be linked or bookmarked. */
export function encodeWeights(weights: Weights): string {
  return SIGNALS.map((id) => String(Math.round((weights[id] ?? 0) * 100) / 100)).join(',');
}

export function decodeWeights(encoded: string | undefined): Weights {
  if (!encoded) return { ...DEFAULT_WEIGHTS };
  const parts = encoded.split(',');
  const out = { ...DEFAULT_WEIGHTS };
  SIGNALS.forEach((id, i) => {
    const value = Number(parts[i]);
    out[id] = Number.isFinite(value) ? Math.min(3, Math.max(0, value)) : 0;
  });
  return out;
}

export function csvOf(rows: RankedGene[]): string {
  const head = [
    'rank',
    'orf',
    'gene',
    'product',
    'category',
    'score',
    ...SIGNALS,
    'omega_db',
    'dpd',
    'alleles',
    'papers',
  ];
  const escape = (value: string): string => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const lines = [head.join(',')];
  rows.forEach((row, i) => {
    const byId = new Map(row.signals.map((s) => [s.id, s.value]));
    lines.push(
      [
        String(i + 1),
        row.gene.orf,
        row.gene.gene ?? '',
        escape(row.gene.annotation),
        row.gene.category,
        row.score.toFixed(2),
        ...SIGNALS.map((id) => {
          const value = byId.get(id);
          return value === null || value === undefined ? '' : value.toFixed(4);
        }),
        row.selection?.omegaDb?.toFixed(4) ?? '',
        row.selection?.dpd?.toFixed(4) ?? '',
        row.selection?.alleles !== null && row.selection?.alleles !== undefined ? String(row.selection.alleles) : '',
        row.literature === null ? '' : String(row.literature),
      ].join(','),
    );
  });
  return lines.join('\n');
}
