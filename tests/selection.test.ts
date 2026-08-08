import { describe, expect, it } from 'vitest';
import publishedCatalog from '../public/data/genes.json';
import { publishedSelectionJson } from './helpers/publishedSelection';
import { SelectionValidationError, validateSelection, type SelectionGene } from '../src/lib/selection';
import {
  LRT_CRITICAL_05,
  PUBLISHED_THRESHOLDS,
  chiSquareP,
  erfc,
  geneStats,
  methodAgreement,
  pearsonChiSquare,
  pnpsPair,
  positiveCriteria,
  purifyingCriteria,
  ranks,
  reproduction,
  selectionCall,
  spearman,
} from '../src/lib/selectionStats';

// The dataset ships encrypted, so these assertions run wherever the passphrase
// is available and skip where it is not.
const raw = await publishedSelectionJson();
const available = raw !== null;
const withDataset = describe.skipIf(!available);
// Typed as present: every use of it sits in a block that skips when it is not.
const publishedSelection = raw as { genes: Record<string, unknown>[]; count: number; fitted: number };
const dataset = available ? validateSelection(publishedSelection) : (null as never);
const named = (gene: SelectionGene) => gene.name;

if (!available) {
  console.warn('selection.enc could not be opened; dataset assertions skipped (set SELECTION_PASSPHRASE).');
}

withDataset('selection dataset validation', () => {
  it('accepts the published dataset: 4,018 genes, 2,455 branch-model fits', () => {
    expect(dataset.count).toBe(4018);
    expect(dataset.genes).toHaveLength(4018);
    expect(dataset.fitted).toBe(2455);
    expect(dataset.metadata.cohorts).toMatchObject({ db: 178, ndb: 744, total: 922 });
  });

  it('covers exactly the genes in the H37Rv catalog, with matching symbols', () => {
    const catalog = new Map(publishedCatalog.genes.map((gene) => [gene.o, gene.g]));
    expect(dataset.count).toBe(publishedCatalog.count);
    for (const gene of dataset.genes) {
      expect(catalog.has(gene.orf)).toBe(true);
      expect(gene.gene).toBe(catalog.get(gene.orf) ?? null);
    }
  });

  it('reports the cohort composition the study describes', () => {
    const total = (facet: string) =>
      dataset.metadata.composition
        .filter((row) => row.facet === facet)
        .reduce((sum, row) => sum + row.db + row.ndb, 0);
    for (const facet of ['study', 'country', 'lineage', 'resistance']) expect(total(facet)).toBe(922);
    const lineage4 = dataset.metadata.composition.find((row) => row.facet === 'lineage' && row.group === 'lineage4');
    expect(lineage4).toMatchObject({ db: 125, ndb: 575 });
  });

  it('rejects a payload whose fitted count disagrees with the fits', () => {
    const broken = { ...publishedSelection, fitted: 2454 };
    expect(() => validateSelection(broken)).toThrow(SelectionValidationError);
  });

  it('rejects an unknown PAML status index', () => {
    const genes = publishedSelection.genes.map((gene, index) => (index === 0 ? { ...gene, pst: 999 } : gene));
    expect(() => validateSelection({ ...publishedSelection, genes })).toThrow(/not a known PAML status/);
  });

  it('rejects a duplicate gene', () => {
    const genes = [...publishedSelection.genes, publishedSelection.genes[0]];
    expect(() => validateSelection({ ...publishedSelection, genes, count: genes.length })).toThrow(/duplicate/);
  });
});

// Statistics that stand on their own, so they run everywhere.
describe('chi-square tail and rank correlation', () => {
  it('erfc matches known values', () => {
    expect(erfc(0)).toBeCloseTo(1, 10);
    expect(erfc(1)).toBeCloseTo(0.157299207, 7);
    expect(erfc(-1)).toBeCloseTo(1.842700793, 7);
    expect(erfc(3)).toBeCloseTo(2.20904969e-5, 10);
  });

  it('puts the 0.05 critical value at 3.841', () => {
    expect(chiSquareP(LRT_CRITICAL_05)).toBeCloseTo(0.05, 6);
    expect(chiSquareP(6.6349)).toBeCloseTo(0.01, 5);
    expect(chiSquareP(0)).toBe(1);
    expect(chiSquareP(-1)).toBe(1);
  });

  it('computes a 2x2 chi-square, adding a pseudocount only when a cell is zero', () => {
    expect(pearsonChiSquare({ dbNsyn: 8, dbSyn: 1, ndbNsyn: 10, ndbSyn: 9 })).toBeCloseTo(3.4968, 3);
    // Rv3055 has no synonymous change in the diabetes cohort.
    expect(pearsonChiSquare({ dbNsyn: 4, dbSyn: 0, ndbNsyn: 1, ndbSyn: 5 })).toBeCloseTo(4.6667, 3);
  });

  it('recomputes pN/pS with the study pseudocount convention', () => {
    const gene = {
      counts: { dbSyn: 0, dbNsyn: 4, ndbSyn: 5, ndbNsyn: 1 },
      synSites: 496,
      nsynSites: 1340,
    } as SelectionGene;
    const ratios = pnpsPair(gene);
    expect(ratios?.db).toBeCloseTo(1.8531, 3);
    expect(ratios?.ndb).toBeCloseTo(0.1235, 3);
    expect(ratios?.deltaLog2).toBeCloseTo(3.9069, 3);
  });

  it('averages tied ranks', () => {
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
    expect(ranks([5])).toEqual([1]);
  });

  it('is 1 for an identical ordering and -1 for a reversed one', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 10);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 10);
    expect(spearman([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(spearman([1], [1])).toBeNull();
  });
});

withDataset('published chi-square and branch-model P-values', () => {
  it('reproduces every published chi-square P-value from the counts', () => {
    let worst = 0;
    for (const gene of dataset.genes) {
      if (!gene.counts || gene.chiSq === null) continue;
      worst = Math.max(worst, Math.abs(chiSquareP(gene.chiSq) - chiSquareP(pearsonChiSquare(gene.counts) ?? 0)));
    }
    // The published chi-square is rounded to four decimals, so the P-values
    // agree to about that precision and no better.
    expect(worst).toBeLessThan(0.002);
  });

  it('reproduces the published branch-model P-values', () => {
    const fitted = dataset.genes.filter((gene) => gene.pamlFitted);
    expect(fitted).toHaveLength(2455);
    const significant = fitted.filter((gene) => geneStats(gene).lrtSignificant);
    expect(significant).toHaveLength(19);
    for (const gene of significant) expect(Math.abs(gene.pamlSigned2LL ?? 0)).toBeGreaterThan(3.84);
  });
});

withDataset('pN/pS recomputation', () => {
  it('recomputes the published ratios from the raw counts', () => {
    const gene = dataset.byOrf.get('Rv3055');
    expect(gene).toBeDefined();
    const ratios = pnpsPair(gene as SelectionGene);
    expect(ratios?.db).toBeCloseTo(1.8531, 3);
    expect(ratios?.ndb).toBeCloseTo(0.1235, 3);
    expect(ratios?.deltaLog2).toBeCloseTo(3.9069, 3);
  });

  it('agrees with the published sheet across the genome, bar the rounded site counts', () => {
    const check = reproduction(dataset.genes);
    expect(check.chiSqChecked).toBe(4018);
    expect(check.chiSqMaxDelta).toBeLessThan(0.001);
    expect(check.pnpsChecked).toBe(8036);
    // 36 of 8,036 cohort ratios differ, all by under 0.006, because the sheet
    // publishes possible-site counts rounded to whole sites.
    expect(check.pnpsOutliers).toBe(36);
    expect(check.pnpsMaxDelta).toBeLessThan(0.006);
    expect(check.deltaLog2MaxDelta).toBeLessThan(0.008);
  });

  it('treats a cohort with no synonymous change as finite, not infinite', () => {
    const gene = dataset.byOrf.get('Rv3055') as SelectionGene;
    expect(gene.counts?.dbSyn).toBe(0);
    expect(Number.isFinite(pnpsPair(gene)?.db ?? Infinity)).toBe(true);
  });
});

withDataset('published selection calls', () => {
  // Computed inside the tests, not at collection time, so the file still loads
  // in a checkout that cannot decrypt the dataset.
  const positive = () => dataset.genes.filter((gene) => selectionCall(gene) === 'positive');
  const purifying = () => dataset.genes.filter((gene) => selectionCall(gene) === 'purifying');

  it('finds the 35 genes with DPD above 0.95', () => {
    expect(dataset.genes.filter((gene) => (gene.dpd ?? 0) > PUBLISHED_THRESHOLDS.dpdHigh)).toHaveLength(35);
  });

  it('reproduces Table 2: 18 genes under positive selection in diabetes', () => {
    const list = positive();
    expect(list).toHaveLength(18);
    for (const symbol of ['eccD3', 'relA', 'trxB2', 'Rv0648', 'plcB', 'Rv3377c', 'fadE6', 'Rv2650c']) {
      expect(list.map(named)).toContain(symbol);
    }
  });

  it('reproduces Table 5: 14 genes under purifying selection in diabetes', () => {
    const list = purifying();
    expect(list).toHaveLength(14);
    for (const symbol of ['mshC', 'dnaK', 'eccB3']) expect(list.map(named)).toContain(symbol);
  });

  it('explains each call criterion by criterion', () => {
    const eccD3 = dataset.genes.find((gene) => gene.name === 'eccD3') as SelectionGene;
    expect(positiveCriteria(eccD3).every((c) => c.pass)).toBe(true);
    expect(eccD3.alleles).toBe(23);

    // recG is the highest-ranked gene overall and misses on DPD alone.
    const recG = dataset.genes.find((gene) => gene.name === 'recG') as SelectionGene;
    const criteria = positiveCriteria(recG);
    expect(criteria.find((c) => c.id === 'dpd')?.pass).toBe(false);
    expect(recG.dpd).toBeCloseTo(0.9473, 3);
  });

  it('requires the non-diabetes interval to span 1 for a purifying call', () => {
    for (const gene of purifying()) {
      expect(purifyingCriteria(gene).every((c) => c.pass)).toBe(true);
      expect(gene.omegaDbHi).toBeLessThan(1);
      expect(gene.omegaNdbLo).toBeLessThanOrEqual(1);
      expect(gene.omegaNdbHi).toBeGreaterThanOrEqual(1);
    }
  });

  it('moves with the thresholds', () => {
    const strict = { ...PUBLISHED_THRESHOLDS, dpdHigh: 0.99 };
    expect(dataset.genes.filter((gene) => selectionCall(gene, strict) === 'positive').length).toBeLessThan(18);
    const loose = { ...PUBLISHED_THRESHOLDS, allelesPositive: 0, dpdHigh: 0.9 };
    expect(dataset.genes.filter((gene) => selectionCall(gene, loose) === 'positive').length).toBeGreaterThan(18);
  });
});

withDataset('rank correlation between methods', () => {
  it('reproduces the reported DPD / delta-log2 agreement', () => {
    const all = methodAgreement(dataset.genes);
    expect(all.n).toBe(4018);
    expect(all.dpdVsDeltaLog2).toBeCloseTo(0.92, 2);

    // The agreement is closer among genes with enough observations to pin a
    // ratio of counts down; the study quotes 0.95 over these 1,405 genes.
    const informative = methodAgreement(dataset.genes, 15);
    expect(informative.n).toBe(1405);
    expect(informative.dpdVsDeltaLog2).toBeCloseTo(0.95, 2);
    expect(informative.dpdVsDeltaLog2 as number).toBeGreaterThan(all.dpdVsDeltaLog2 as number);
  });

  it('correlates DPD with the branch-model statistic over the fitted genes', () => {
    const agreement = methodAgreement(dataset.genes);
    expect(agreement.lrtN).toBe(2455);
    expect(agreement.dpdVsLrt).toBeGreaterThan(0.3);
  });
});

withDataset('per-gene statistics', () => {
  it('summarises a gene the study discusses', () => {
    const relA = dataset.genes.find((gene) => gene.name === 'relA') as SelectionGene;
    const stats = geneStats(relA);
    expect(stats.call).toBe('positive');
    expect(relA.alleles).toBe(29);
    expect(stats.omegaDelta as number).toBeGreaterThan(0);
    expect(stats.chiSqP as number).toBeGreaterThan(0);
    expect(stats.chiSqP as number).toBeLessThanOrEqual(1);
  });

  it('leaves model outputs null for a gene the branch model could not fit', () => {
    const gene = dataset.genes.find((g) => !g.pamlFitted) as SelectionGene;
    const stats = geneStats(gene);
    expect(stats.lrtP).toBeNull();
    expect(stats.lrtSignificant).toBe(false);
    expect(gene.pamlStatus).toMatch(/not testable|not run|pinned|pending/);
  });

  it('keeps every PE/PPE gene flagged, since they are outside the allele counts', () => {
    const repetitive = dataset.genes.filter((gene) => gene.repetitive);
    expect(repetitive).toHaveLength(164);
    for (const gene of repetitive) expect(gene.family).toMatch(/^(PE|PPE|PE_PGRS)$/);
  });
});
