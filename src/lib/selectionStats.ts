// Statistics for the Selection Lab.
//
// Everything here is recomputed in the browser from the measured quantities in
// selection.json rather than read out of the source sheet, so the significance
// thresholds can move and the numbers move with them. Where the source sheet
// also publishes a value, `reproduction()` compares the two.

import type { SelectionGene } from './selection';

/**
 * Complementary error function. Chebyshev fit from Numerical Recipes; relative
 * error stays below 1.2e-7 across the range, and because the leading factor
 * carries the exp(-z^2) the accuracy holds into the far tail where P-values
 * are small.
 */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 2 / (2 + z);
  const ty = 4 * t - 2;
  const coefficients = [
    -1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2, -9.561514786808631e-3,
    -9.46595344482036e-4, 3.66839497852761e-4, 4.2523324806907e-5, -2.0278578112534e-5,
    -1.624290004647e-6, 1.303655835580e-6, 1.5626441722e-8, -8.5238095915e-8,
    6.529054439e-9, 5.059343495e-9, -9.91364156e-10, -2.27365122e-10,
    9.6467911e-11, 2.394038e-12, -6.886027e-12, 8.94487e-13,
    3.13092e-13, -1.12708e-13, 3.81e-16, 7.106e-15,
  ];
  let d = 0;
  let dd = 0;
  for (let j = coefficients.length - 1; j > 0; j -= 1) {
    const tmp = d;
    d = ty * d - dd + coefficients[j];
    dd = tmp;
  }
  const answer = t * Math.exp(-z * z + 0.5 * (coefficients[0] + ty * d) - dd);
  return x >= 0 ? answer : 2 - answer;
}

/**
 * Upper tail of a chi-square distribution with one degree of freedom, which is
 * the only case either test here needs: P = erfc(sqrt(x / 2)).
 */
export function chiSquareP(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 1;
  return Math.min(1, erfc(Math.sqrt(x / 2)));
}

/** Critical value of chi-square, one degree of freedom, at the usual alphas. */
export const LRT_CRITICAL_05 = 3.841459;

export interface Counts {
  dbSyn: number;
  dbNsyn: number;
  ndbSyn: number;
  ndbNsyn: number;
}

/**
 * pN/pS for one cohort. Observed over possible, with a pseudocount of 1 on
 * numerator and denominator so the ratio stays finite for a gene with no
 * synonymous change; pN/pS = 1 is neutrality.
 */
export function pnps(nsyn: number, syn: number, nsynSites: number, synSites: number): number | null {
  if (!(nsynSites >= 0) || !(synSites >= 0)) return null;
  const pN = (nsyn + 1) / (nsynSites + 1);
  const pS = (syn + 1) / (synSites + 1);
  if (!(pS > 0)) return null;
  return pN / pS;
}

export interface PnPsResult {
  db: number;
  ndb: number;
  log2Db: number;
  log2Ndb: number;
  deltaLog2: number;
}

/** Recompute both cohorts and their difference of logs from the raw counts. */
export function pnpsPair(gene: SelectionGene): PnPsResult | null {
  const { counts, synSites, nsynSites } = gene;
  if (!counts || synSites === null || nsynSites === null) return null;
  const db = pnps(counts.dbNsyn, counts.dbSyn, nsynSites, synSites);
  const ndb = pnps(counts.ndbNsyn, counts.ndbSyn, nsynSites, synSites);
  if (db === null || ndb === null) return null;
  const log2Db = Math.log2(db);
  const log2Ndb = Math.log2(ndb);
  return { db, ndb, log2Db, log2Ndb, deltaLog2: log2Db - log2Ndb };
}

/**
 * Pearson 2x2 chi-square on [[DB NS, DB S], [NDB NS, NDB S]], uncorrected.
 * A zero anywhere adds a pseudocount of 1 to all four cells, as in the study.
 */
export function pearsonChiSquare(counts: Counts): number | null {
  let a = counts.dbNsyn;
  let b = counts.dbSyn;
  let c = counts.ndbNsyn;
  let d = counts.ndbSyn;
  if (Math.min(a, b, c, d) === 0) {
    a += 1;
    b += 1;
    c += 1;
    d += 1;
  }
  const n = a + b + c + d;
  if (n <= 0) return null;
  const rows = [a + b, c + d];
  const cols = [a + c, b + d];
  if (!rows[0] || !rows[1] || !cols[0] || !cols[1]) return null;
  const cells: [number, number, number][] = [
    [a, 0, 0],
    [b, 0, 1],
    [c, 1, 0],
    [d, 1, 1],
  ];
  let total = 0;
  for (const [observed, row, col] of cells) {
    const expected = (rows[row] * cols[col]) / n;
    total += ((observed - expected) ** 2) / expected;
  }
  return total;
}

/** Tie-averaged ranks, ascending. */
export function ranks(values: number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j += 1;
    const average = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) out[order[k].index] = average;
    i = j + 1;
  }
  return out;
}

/** Spearman rank correlation; null when there is no variation to correlate. */
export function spearman(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 2) return null;
  const ra = ranks(a);
  const rb = ranks(b);
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i += 1) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  const den = Math.sqrt(da * db);
  return den > 0 ? num / den : null;
}

export type SelectionCall = 'positive' | 'purifying' | 'none';

export interface Thresholds {
  /** DPD above this is evidence for stronger selection in diabetes. */
  dpdHigh: number;
  /** DPD below this is evidence for stronger constraint in diabetes. */
  dpdLow: number;
  /** Posterior mean omega_DB must exceed this to call positive selection. */
  omegaMin: number;
  /** Distinct alleles required to call positive selection. */
  allelesPositive: number;
  /** Distinct alleles required to call purifying selection. */
  allelesPurifying: number;
}

/** The criteria the manuscript applies for Table 2 and Table 5. */
export const PUBLISHED_THRESHOLDS: Thresholds = {
  dpdHigh: 0.95,
  dpdLow: 0.05,
  omegaMin: 1,
  allelesPositive: 15,
  allelesPurifying: 14,
};

/** Each published criterion, evaluated one at a time so the UI can show why. */
export interface CriterionResult {
  id: string;
  label: string;
  pass: boolean;
}

export function positiveCriteria(gene: SelectionGene, t: Thresholds = PUBLISHED_THRESHOLDS): CriterionResult[] {
  return [
    { id: 'dpd', label: `DPD > ${t.dpdHigh}`, pass: gene.dpd !== null && gene.dpd > t.dpdHigh },
    { id: 'omega', label: `posterior mean ωDB > ${t.omegaMin}`, pass: gene.omegaDb !== null && gene.omegaDb > t.omegaMin },
    {
      id: 'alleles',
      label: `at least ${t.allelesPositive} distinct alleles`,
      pass: gene.alleles !== null && gene.alleles >= t.allelesPositive,
    },
  ];
}

export function purifyingCriteria(gene: SelectionGene, t: Thresholds = PUBLISHED_THRESHOLDS): CriterionResult[] {
  const dbBelowOne = gene.omegaDbHi !== null && gene.omegaDbHi < 1;
  const ndbSpansOne = gene.omegaNdbLo !== null && gene.omegaNdbHi !== null && gene.omegaNdbLo <= 1 && gene.omegaNdbHi >= 1;
  return [
    { id: 'dpd', label: `DPD < ${t.dpdLow}`, pass: gene.dpd !== null && gene.dpd < t.dpdLow },
    { id: 'db-ci', label: '95% CI for ωDB entirely below 1', pass: dbBelowOne },
    { id: 'ndb-ci', label: '95% CI for ωNDB spans 1', pass: ndbSpansOne },
    {
      id: 'alleles',
      label: `at least ${t.allelesPurifying} distinct alleles`,
      pass: gene.alleles !== null && gene.alleles >= t.allelesPurifying,
    },
  ];
}

export function selectionCall(gene: SelectionGene, t: Thresholds = PUBLISHED_THRESHOLDS): SelectionCall {
  if (positiveCriteria(gene, t).every((c) => c.pass)) return 'positive';
  if (purifyingCriteria(gene, t).every((c) => c.pass)) return 'purifying';
  return 'none';
}

/** Derived per-gene quantities, all recomputed from the measured columns. */
export interface GeneStats {
  pnps: PnPsResult | null;
  chiSq: number | null;
  chiSqP: number | null;
  lrtP: number | null;
  lrtSignificant: boolean;
  call: SelectionCall;
  /** Posterior means differ by this much, diabetes minus non-diabetes. */
  omegaDelta: number | null;
}

export function geneStats(gene: SelectionGene, t: Thresholds = PUBLISHED_THRESHOLDS): GeneStats {
  const chiSq = gene.counts ? pearsonChiSquare(gene.counts) : null;
  const twoDeltaLL = gene.pamlFitted && gene.pamlSigned2LL !== null ? Math.abs(gene.pamlSigned2LL) : null;
  return {
    pnps: pnpsPair(gene),
    chiSq,
    chiSqP: chiSq === null ? null : chiSquareP(chiSq),
    lrtP: twoDeltaLL === null ? null : chiSquareP(twoDeltaLL),
    lrtSignificant: twoDeltaLL !== null && twoDeltaLL > LRT_CRITICAL_05,
    call: selectionCall(gene, t),
    omegaDelta: gene.omegaDb !== null && gene.omegaNdb !== null ? gene.omegaDb - gene.omegaNdb : null,
  };
}

/**
 * Agreement between the app's recomputation and the values the source sheet
 * publishes. Shown in the provenance panel rather than hidden, because the
 * sheet reports possible-site counts rounded to integers and a handful of
 * pN/pS values therefore differ in the third decimal.
 */
export interface Reproduction {
  genes: number;
  chiSqChecked: number;
  chiSqMaxDelta: number;
  pnpsChecked: number;
  pnpsMaxDelta: number;
  deltaLog2Checked: number;
  deltaLog2MaxDelta: number;
  /** Genes whose recomputed pN/pS differs from the published value by more than the tolerance. */
  pnpsOutliers: number;
}

export const REPRODUCTION_TOLERANCE = 0.0005;

export function reproduction(genes: SelectionGene[]): Reproduction {
  let chiSqChecked = 0;
  let chiSqMaxDelta = 0;
  let pnpsChecked = 0;
  let pnpsMaxDelta = 0;
  let pnpsOutliers = 0;
  let deltaLog2Checked = 0;
  let deltaLog2MaxDelta = 0;

  for (const gene of genes) {
    if (gene.counts && gene.chiSq !== null) {
      const recomputed = pearsonChiSquare(gene.counts);
      if (recomputed !== null) {
        chiSqChecked += 1;
        chiSqMaxDelta = Math.max(chiSqMaxDelta, Math.abs(recomputed - gene.chiSq));
      }
    }
    const ratios = pnpsPair(gene);
    if (ratios) {
      for (const [recomputed, published] of [
        [ratios.db, gene.publishedPnPsDb],
        [ratios.ndb, gene.publishedPnPsNdb],
      ] as const) {
        if (published === null) continue;
        pnpsChecked += 1;
        const delta = Math.abs(recomputed - published);
        pnpsMaxDelta = Math.max(pnpsMaxDelta, delta);
        if (delta > REPRODUCTION_TOLERANCE) pnpsOutliers += 1;
      }
      if (gene.publishedDeltaLog2 !== null) {
        deltaLog2Checked += 1;
        deltaLog2MaxDelta = Math.max(deltaLog2MaxDelta, Math.abs(ratios.deltaLog2 - gene.publishedDeltaLog2));
      }
    }
  }

  return {
    genes: genes.length,
    chiSqChecked,
    chiSqMaxDelta,
    pnpsChecked,
    pnpsMaxDelta,
    deltaLog2Checked,
    deltaLog2MaxDelta,
    pnpsOutliers,
  };
}

/** Genome-wide agreement between the three rankings. */
export interface MethodAgreement {
  n: number;
  dpdVsDeltaLog2: number | null;
  dpdVsLrt: number | null;
  lrtN: number;
}

export function methodAgreement(genes: SelectionGene[], minAlleles = 0): MethodAgreement {
  const dpd: number[] = [];
  const delta: number[] = [];
  const lrtDpd: number[] = [];
  const lrt: number[] = [];
  for (const gene of genes) {
    if (minAlleles > 0 && (gene.alleles === null || gene.alleles < minAlleles)) continue;
    const ratios = pnpsPair(gene);
    if (gene.dpd !== null && ratios) {
      dpd.push(gene.dpd);
      delta.push(ratios.deltaLog2);
    }
    if (gene.dpd !== null && gene.pamlFitted && gene.pamlSigned2LL !== null) {
      lrtDpd.push(gene.dpd);
      lrt.push(gene.pamlSigned2LL);
    }
  }
  return {
    n: dpd.length,
    dpdVsDeltaLog2: spearman(dpd, delta),
    dpdVsLrt: spearman(lrtDpd, lrt),
    lrtN: lrt.length,
  };
}
