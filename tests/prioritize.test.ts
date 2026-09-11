import { describe, expect, it } from 'vitest';
import type { CategoryId, Gene } from '../src/lib/types';
import type { SelectionGene } from '../src/lib/selection';
import type { PortalGeneEnrichment } from '../src/lib/portalEnrichment';
import {
  DEFAULT_WEIGHTS,
  SIGNALS,
  SIGNAL_META,
  annotationConfidence,
  csvOf,
  decodeWeights,
  encodeWeights,
  rankGenes,
  type Weights,
} from '../src/lib/prioritize';
import { geneQuery } from '../src/lib/literature';
import { DEFAULT_LOOKUP_STATE, lookupStatePath, parseLookupState } from '../src/lib/lookupState';
import { parseHash } from '../src/lib/router';

function gene(over: Partial<Gene> & { orf: string }): Gene {
  return {
    gene: null,
    start: 1,
    end: 900,
    strand: '+',
    length: 300,
    bp: 900,
    annotation: 'Conserved hypothetical protein',
    category: 'hypothetical' as CategoryId,
    uniprot: null,
    ...over,
    name: over.gene ?? over.orf,
  };
}

function selectionRow(over: Partial<SelectionGene> & { orf: string }): SelectionGene {
  return {
    gene: null,
    name: over.orf,
    codons: 300,
    synSites: 200,
    nsynSites: 700,
    family: null,
    repetitive: false,
    dpd: null,
    dpdRank: null,
    omegaDb: null,
    omegaDbLo: null,
    omegaDbHi: null,
    omegaNdb: null,
    omegaNdbLo: null,
    omegaNdbHi: null,
    counts: null,
    alleles: null,
    publishedPnPsDb: null,
    publishedPnPsNdb: null,
    publishedDeltaLog2: null,
    deltaLog2Rank: null,
    chiSq: null,
    chiSqRank: null,
    pamlStatus: null,
    pamlFitted: true,
    pamlOmegaDb: null,
    pamlOmegaNdb: null,
    pamlSigned2LL: null,
    pamlHaplotypes: null,
    ...over,
  };
}

const CATALOG: Gene[] = [
  gene({ orf: 'Rv0290', gene: 'eccD3', annotation: 'ESX conserved component EccD3', category: 'cell-wall' }),
  gene({ orf: 'Rv0205', annotation: 'Possible conserved transmembrane protein', category: 'cell-wall' }),
  gene({ orf: 'Rv2583c', gene: 'relA', annotation: 'GTP pyrophosphokinase RelA', category: 'metabolism' }),
  gene({ orf: 'Rv3910', annotation: 'Conserved hypothetical protein', category: 'hypothetical' }),
];

const SELECTION = new Map<string, SelectionGene>([
  ['Rv0290', selectionRow({ orf: 'Rv0290', dpd: 0.9684, omegaDb: 2.245, omegaNdb: 0.64, alleles: 23, publishedDeltaLog2: 2.03, pamlSigned2LL: 3.91, chiSq: 3.5 })],
  ['Rv3910', selectionRow({ orf: 'Rv3910', dpd: 0.5, omegaDb: 0.4, omegaNdb: 0.42, alleles: 2, publishedDeltaLog2: 0.01, pamlSigned2LL: 0.1, chiSq: 0.1 })],
]);

describe('literature queries', () => {
  it('pairs the identifiers with the organism, and scopes counts to title and abstract', () => {
    expect(geneQuery(CATALOG[0])).toBe('(TITLE_ABS:"Rv0290" OR TITLE_ABS:"eccD3") AND (tuberculosis OR mycobacterium)');
    expect(geneQuery(CATALOG[0], 'full-text')).toBe('("Rv0290" OR "eccD3") AND (tuberculosis OR mycobacterium)');
    expect(geneQuery(CATALOG[0], 'title-abstract', 'rifampin')).toContain('TITLE_ABS:"rifampin"');
  });

  it('uses the locus alone when the gene has no symbol', () => {
    expect(geneQuery(CATALOG[1])).toBe('(TITLE_ABS:"Rv0205") AND (tuberculosis OR mycobacterium)');
  });
});

describe('annotation confidence', () => {
  const agreeing: PortalGeneEnrichment = {
    annotations: {
      TBDB: 'Catalase-peroxidase KatG',
      REFSEQ: 'catalase peroxidase KatG',
      PATRIC: 'Catalase-peroxidase KatG',
      TUBERCULIST: 'Catalase-peroxidase KatG',
      NCBI: 'Catalase-peroxidase KatG',
    },
  };
  const disagreeing: PortalGeneEnrichment = {
    annotations: {
      TBDB: 'Hypothetical protein',
      REFSEQ: 'membrane transporter',
      PATRIC: 'Possible oxidoreductase',
    },
  };

  it('scores five agreeing sources above three that disagree', () => {
    expect(annotationConfidence(CATALOG[0], agreeing)).toBeGreaterThan(annotationConfidence(CATALOG[0], disagreeing));
  });

  it('discounts agreement that is only agreement about not knowing', () => {
    const hedged: PortalGeneEnrichment = {
      annotations: {
        TBDB: 'Conserved hypothetical protein',
        REFSEQ: 'hypothetical protein',
        PATRIC: 'Conserved hypothetical protein',
        TUBERCULIST: 'Conserved hypothetical protein',
        NCBI: 'hypothetical protein',
      },
    };
    expect(annotationConfidence(CATALOG[3], hedged)).toBeLessThan(annotationConfidence(CATALOG[0], agreeing));
  });

  it('falls back to reading the catalog annotation when the portal has nothing', () => {
    const named = annotationConfidence(gene({ orf: 'Rv1', annotation: 'Catalase-peroxidase KatG' }), null);
    const hedged = annotationConfidence(gene({ orf: 'Rv2', annotation: 'Probable oxidoreductase' }), null);
    const blank = annotationConfidence(gene({ orf: 'Rv3', annotation: 'Conserved hypothetical protein' }), null);
    expect(named).toBeGreaterThan(hedged);
    expect(hedged).toBeGreaterThan(blank);
  });

  it('stays within 0 and 1 for every shape of input', () => {
    for (const value of [annotationConfidence(CATALOG[0], agreeing), annotationConfidence(CATALOG[0], disagreeing), annotationConfidence(CATALOG[3], null)]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('GenePrioritize', () => {
  it('puts a strongly selected, well-observed gene above a flat one', () => {
    const ranked = rankGenes({ genes: CATALOG, selection: SELECTION, weights: DEFAULT_WEIGHTS });
    const order = ranked.map((r) => r.gene.orf);
    expect(order.indexOf('Rv0290')).toBeLessThan(order.indexOf('Rv3910'));
    expect(ranked.every((r) => r.score >= 0 && r.score <= 100)).toBe(true);
  });

  it('records what each signal contributed, and what was missing', () => {
    const ranked = rankGenes({ genes: CATALOG, selection: SELECTION, weights: DEFAULT_WEIGHTS });
    const eccD3 = ranked.find((r) => r.gene.orf === 'Rv0290')!;
    expect(eccD3.signals.map((s) => s.id)).toEqual([...SIGNALS]);
    expect(eccD3.signals.find((s) => s.id === 'selection')?.value).toBeGreaterThan(0.5);
    // Nothing supplied literature or portal enrichment, so those are absent rather than zero.
    expect(eccD3.missing).toContain('literature');
    expect(eccD3.missing).toContain('lineage');
    expect(eccD3.signals.find((s) => s.id === 'literature')?.value).toBeNull();
  });

  it('does not punish a gene for a signal nobody measured', () => {
    const [only] = rankGenes({ genes: [CATALOG[0]], selection: null, weights: DEFAULT_WEIGHTS });
    expect(only.score).toBeGreaterThan(0);
    expect(only.missing).toEqual(expect.arrayContaining(['selection', 'significance', 'mutations', 'cohort']));
  });

  it('still ranks on real signals while the diabetes dataset is locked', () => {
    const enrichment = new Map<string, PortalGeneEnrichment>([
      ['Rv0290', { pnps: { overall: 2.4 }, omegaPeak: 2.9, underSelection: true }],
      ['Rv3910', { pnps: { overall: 0.2 }, omegaPeak: 0.3, underSelection: false }],
    ]);
    const ranked = rankGenes({ genes: CATALOG, selection: null, enrichment, weights: DEFAULT_WEIGHTS });
    const order = ranked.map((r) => r.gene.orf);
    expect(order.indexOf('Rv0290')).toBeLessThan(order.indexOf('Rv3910'));
    expect(ranked.find((r) => r.gene.orf === 'Rv0290')!.missing).not.toContain('lineage');
  });

  it('follows the weights: zeroing a signal removes its influence', () => {
    const onlyLiterature = Object.fromEntries(SIGNALS.map((id) => [id, id === 'literature' ? 1 : 0])) as Weights;
    const literature = new Map([['Rv3910', 400], ['Rv0290', 4]]);
    const ranked = rankGenes({ genes: CATALOG, selection: SELECTION, literature, weights: onlyLiterature });
    expect(ranked[0].gene.orf).toBe('Rv3910');
    expect(ranked[0].literature).toBe(400);
  });

  it('lets the pathway weight lift the classes you choose', () => {
    const weights = Object.fromEntries(SIGNALS.map((id) => [id, id === 'pathway' ? 1 : 0])) as Weights;
    const ranked = rankGenes({ genes: CATALOG, selection: null, weights, pathways: ['metabolism'] });
    expect(ranked[0].gene.orf).toBe('Rv2583c');
  });

  it('treats an all-zero weighting as no opinion rather than a crash', () => {
    const zero = Object.fromEntries(SIGNALS.map((id) => [id, 0])) as Weights;
    const ranked = rankGenes({ genes: CATALOG, selection: SELECTION, weights: zero });
    expect(ranked).toHaveLength(CATALOG.length);
    expect(ranked.every((r) => r.score === 0)).toBe(true);
  });

  it('describes every signal it ranks on', () => {
    expect(SIGNAL_META.map((m) => m.id)).toEqual([...SIGNALS]);
    // The signals that come from the unpublished study are the ones marked locked.
    expect(SIGNAL_META.filter((m) => m.locked).map((m) => m.id)).toEqual([
      'selection',
      'significance',
      'mutations',
      'cohort',
    ]);
  });

  it('exports a CSV whose header matches every row', () => {
    const ranked = rankGenes({ genes: CATALOG, selection: SELECTION, weights: DEFAULT_WEIGHTS });
    const lines = csvOf(ranked).split('\n');
    const columns = lines[0].split(',').length;
    expect(lines).toHaveLength(CATALOG.length + 1);
    for (const line of lines.slice(1)) {
      // Products can contain commas, so count on a line with quotes stripped of their contents.
      expect(line.replace(/"[^"]*"/g, '""').split(',')).toHaveLength(columns);
    }
  });
});

describe('GeneLookup URL state', () => {
  it('defaults to a bare route', () => {
    expect(lookupStatePath(parseLookupState({}))).toBe('lookup');
    expect(parseLookupState({})).toEqual(DEFAULT_LOOKUP_STATE);
  });

  it('round-trips a customised view through the query string', () => {
    const state = {
      ...DEFAULT_LOOKUP_STATE,
      gene: 'Rv0290',
      term: 'rifampin',
      weights: { ...DEFAULT_WEIGHTS, selection: 2, literature: 0 },
      pathways: ['regulatory' as CategoryId],
      page: 3,
    };
    const path = lookupStatePath(state);
    expect(path).toContain('term=rifampin');
    expect(parseLookupState(parseHash(`#/${path}`).params)).toEqual(state);
  });

  it('separates "no pathways" from "pathways not specified"', () => {
    expect(parseLookupState({ path: '' }).pathways).toEqual([]);
    expect(parseLookupState({}).pathways).toEqual(DEFAULT_LOOKUP_STATE.pathways);
  });

  it('ignores junk in the weight and pathway parameters', () => {
    expect(parseLookupState({ w: '-4,x' }).weights.selection).toBe(0);
    expect(decodeWeights('9,9,9,9,9,9,9,9').selection).toBe(3);
    expect(parseLookupState({ path: 'not-a-class,regulatory' }).pathways).toEqual(['regulatory']);
  });

  it('round-trips the weights themselves', () => {
    const weights: Weights = { ...DEFAULT_WEIGHTS, selection: 2, literature: 0 };
    expect(decodeWeights(encodeWeights(weights))).toEqual(weights);
    expect(decodeWeights(undefined)).toEqual(DEFAULT_WEIGHTS);
  });
});

describe('routing', () => {
  it('knows the lookup route', () => {
    expect(parseHash('#/lookup').path).toBe('lookup');
    expect(parseHash('#/lookup?gene=Rv0290').params.gene).toBe('Rv0290');
    expect(parseHash('#/lookup/extra').notFound).toBe(true);
  });
});
