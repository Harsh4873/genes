// Builds the differential-selection dataset for the Selection Lab.
//
// Source: the DB-vs-NDB master sheet from an in-house study of positive
// selection in M. tuberculosis isolates from TB patients with and without
// diabetes. The manuscript is in preparation, so neither the snapshots nor the
// plaintext dataset are committed: the snapshots live outside the repository
// (default ./private, override with SELECTION_SOURCE_DIR) and this script's
// output is gitignored. Only the encrypted artefact produced by
// encrypt-selection.mjs is committed and published.
//
// Only measured quantities are carried into the payload. Everything derivable
// from them — pN/pS, log ratios, chi-square and likelihood-ratio P-values,
// significance calls — is recomputed in the browser (src/lib/selectionStats.ts)
// so the thresholds stay live and every printed number has a visible origin.
// The three published rank columns are kept verbatim, because the manuscript
// cites them and they carry the source sheet's tie-breaking.
//
// Run: node scripts/build-selection.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const SELECTION_SNAPSHOT_PATH = 'selection-db-ndb.tsv';
export const COHORT_SNAPSHOT_PATH = 'selection-cohort.tsv';

const SOURCE_DIR = resolve(here, '../', process.env.SELECTION_SOURCE_DIR ?? 'private');
const SELECTION_SRC = resolve(SOURCE_DIR, SELECTION_SNAPSHOT_PATH);
const COHORT_SRC = resolve(SOURCE_DIR, COHORT_SNAPSHOT_PATH);
// Deliberately outside public/: anything under public/ is copied into dist and
// published, and the plaintext of this dataset must never be.
const OUT = resolve(SOURCE_DIR, 'selection.json');

/** Columns read out of the master sheet, by exact header text. */
const COLUMNS = {
  orf: 'Gene ID',
  gene: 'Gene name',
  aa: 'Protein length (aa)',
  synSites: 'Possible syn sites',
  nsynSites: 'Possible nsyn sites',
  family: 'PE/PPE family',
  dpdRank: 'DPD rank',
  dpd: 'DPD',
  omegaDb: 'ωDB mean',
  omegaDbLo: 'ωDB CI2.5',
  omegaDbHi: 'ωDB CI97.5',
  omegaNdb: 'ωNDB mean',
  omegaNdbLo: 'ωNDB CI2.5',
  omegaNdbHi: 'ωNDB CI97.5',
  dbSyn: 'DB n Syn',
  dbNsyn: 'DB n Nsyn',
  dbPnPs: 'DB pN/pS',
  ndbSyn: 'NDB n Syn',
  ndbNsyn: 'NDB n Nsyn',
  ndbPnPs: 'NDB pN/pS',
  alleles: 'Distinct alleles (922 pooled)',
  deltaLog2: 'Δlog2(pN/pS)',
  deltaLog2Rank: 'Δlog2(pN/pS) rank',
  chiSq: 'χ2',
  chiSqRank: 'χ2 rank',
  pamlStatus: 'PAML status',
  pamlOmegaDb: 'PAML ωDB',
  pamlOmegaNdb: 'PAML ωNDB',
  pamlSigned2LL: 'PAML signed 2ΔLL',
  pamlHaplotypes: 'PAML haplotypes',
};

function parseTsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const header = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    const row = {};
    header.forEach((name, index) => {
      row[name] = cells[index] ?? '';
    });
    return row;
  });
}

function text(row, column) {
  const value = (row[COLUMNS[column]] ?? '').trim();
  return value === '' || value === '-' ? null : value;
}

function num(row, column) {
  const value = text(row, column);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function int(row, column) {
  const value = num(row, column);
  return value === null ? null : Math.round(value);
}

/** Trim MCMC and codeml output to the precision the sheet itself reports. */
function round(value, digits) {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function buildSelection() {
  const selectionSnapshot = readFileSync(SELECTION_SRC);
  const cohortSnapshot = readFileSync(COHORT_SRC);
  const rows = parseTsv(selectionSnapshot.toString('utf8'));

  // PAML status is one of a short list of sentences repeated thousands of
  // times; store the list once and index into it.
  const statuses = [];
  const statusIndex = new Map();
  const statusId = (value) => {
    if (value === null) return null;
    if (!statusIndex.has(value)) {
      statusIndex.set(value, statuses.length);
      statuses.push(value);
    }
    return statusIndex.get(value);
  };

  const genes = [];
  for (const row of rows) {
    const orf = text(row, 'orf');
    if (!orf) continue;
    genes.push({
      o: orf,
      n: text(row, 'gene'),
      aa: int(row, 'aa'),
      ss: int(row, 'synSites'),
      sn: int(row, 'nsynSites'),
      fam: text(row, 'family'),
      dpd: round(num(row, 'dpd'), 4),
      dr: int(row, 'dpdRank'),
      wd: round(num(row, 'omegaDb'), 4),
      wdl: round(num(row, 'omegaDbLo'), 4),
      wdh: round(num(row, 'omegaDbHi'), 4),
      wn: round(num(row, 'omegaNdb'), 4),
      wnl: round(num(row, 'omegaNdbLo'), 4),
      wnh: round(num(row, 'omegaNdbHi'), 4),
      ds: int(row, 'dbSyn'),
      dn: int(row, 'dbNsyn'),
      ns: int(row, 'ndbSyn'),
      nn: int(row, 'ndbNsyn'),
      al: int(row, 'alleles'),
      // Published pN/pS values, kept so the app can show the sheet's number
      // beside the one it recomputes from the counts.
      pd: round(num(row, 'dbPnPs'), 4),
      pn: round(num(row, 'ndbPnPs'), 4),
      dl: round(num(row, 'deltaLog2'), 4),
      dlr: int(row, 'deltaLog2Rank'),
      x2: round(num(row, 'chiSq'), 4),
      x2r: int(row, 'chiSqRank'),
      pst: statusId(text(row, 'pamlStatus')),
      pwd: round(num(row, 'pamlOmegaDb'), 5),
      pwn: round(num(row, 'pamlOmegaNdb'), 5),
      pll: round(num(row, 'pamlSigned2LL'), 4),
      ph: int(row, 'pamlHaplotypes'),
    });
  }

  const composition = parseTsv(cohortSnapshot.toString('utf8')).map((row) => ({
    facet: row.facet,
    group: row.group,
    db: Number(row.diabetes),
    ndb: Number(row['non-diabetes']),
  }));

  const db = 178;
  const ndb = 744;
  const fitted = genes.filter((gene) => statuses[gene.pst] === 'ok').length;

  const payload = {
    metadata: {
      schema: {
        name: 'mtbscope-selection',
        version: 1,
      },
      study: {
        title:
          'Differential Bayesian analysis of M. tuberculosis genes under positive selection in TB patients with diabetes',
        status: 'unpublished',
        note: 'Manuscript in preparation. These are real analysis results, not demonstration data, and they are not peer reviewed.',
      },
      cohorts: {
        db,
        ndb,
        total: db + ndb,
        dbLabel: 'Diabetes (DB)',
        ndbLabel: 'Non-diabetes (NDB)',
        sources: 'TANDEM and MEX-TB whole-genome sequencing, retrieved from the NCBI Sequence Read Archive',
        filters:
          'Isolates with a recorded diabetes status; excluded below a median depth of 40 over target regions, or called mixed by TB-Profiler.',
      },
      composition,
      methods: {
        alignment:
          'Per isolate, each coding sequence was taken from a Pilon assembly in the H37Rv annotation frame; assemblies are reference-mapped, so no separate alignment step was applied. Any codon carrying a gap, an ambiguous base, or a stop was written as "---" and read as missing rather than as a substitution. Each gene was split by cohort into a 178-sequence file, a 744-sequence file, and a pooled 922-sequence file.',
        genomegamap:
          'GenomegaMap v1.0.1, Constant model (one gene-level posterior for omega), NY98 codon substitution model, equilibrium codon frequencies fixed uniform at 1/61, improper log-uniform priors on theta and kappa, exponential prior with mean 1 on omega. 10,000 MCMC iterations per gene per cohort, first 2,000 discarded as burn-in, every fifth iteration thereafter recorded: 1,600 posterior samples. The credible interval is the 2.5th and 97.5th percentile of those samples.',
        dpd:
          'DPD = P(omega_DB > omega_NDB), estimated from 10,000 paired draws, one from each cohort posterior. Monte Carlo standard error sqrt(p(1-p)/N) is 0.0022 at p = 0.95, so a 95% band is about +/- 0.004. DPD near 1 means omega is higher in diabetes in nearly every draw, 0.5 means the posteriors are indistinguishable.',
        pnps:
          'At each codon the reference codon\'s nine single-nucleotide neighbours are classified synonymous or nonsynonymous to give the possible-site counts; each distinct observed codon is classified the same way, and a codon differing at more than one nucleotide is counted as nonsynonymous. pN and pS are observed over possible, each with a pseudocount of 1 on numerator and denominator, so pN/pS = 1 is neutral. Cohorts are compared by the difference of log2 pN/pS, diabetes minus non-diabetes.',
        chisq:
          'Pearson 2x2 chi-square on [[DB NS, DB S], [NDB NS, NDB S]], one degree of freedom, without the Yates continuity correction. When any cell is zero a pseudocount of 1 is added to all four. Reported as secondary support, not as a significance criterion.',
        paml:
          'codeml (PAML 4) branch model on a genome-wide parsimony tree of the 922 isolates built with TNT, pruned to each cohort and rejoined so the cohorts form clades. Uniform codon frequencies (CodonFreq = 0), kappa fixed at 4 (fix_kappa = 1), one omega class per branch class (NSsites = 0), no clock. M0 estimates branch lengths with a single shared omega; M2 holds those lengths fixed (fix_blength = 2) and fits omega_DB and omega_NDB. The test is a likelihood-ratio test of M2 against M0 with one degree of freedom; the reported statistic is signed by sign(omega_DB - omega_NDB).',
        alleles:
          'An allele is a distinct non-reference codon at a codon position, counted once however many isolates carry it, over all 922 isolates pooled so a variant present in both cohorts is not double counted. PE_PGRS and PPE genes are excluded from these counts.',
      },
      criteria: {
        positive:
          'Positive selection in diabetes: DPD > 0.95, posterior mean omega_DB > 1, and at least 15 distinct alleles.',
        purifying:
          'Purifying selection in diabetes: DPD < 0.05, the 95% credible interval for omega_DB entirely below 1, the non-diabetes interval spanning 1, and at least 14 distinct alleles.',
        lrt: 'Branch-model significance: 2dLL > 3.84 (chi-square, one degree of freedom, alpha = 0.05).',
      },
      pamlStatuses: statuses,
      snapshot: {
        path: SELECTION_SNAPSHOT_PATH,
        checksum: {
          algorithm: 'sha256',
          value: createHash('sha256').update(selectionSnapshot).digest('hex'),
        },
      },
      cohortSnapshot: {
        path: COHORT_SNAPSHOT_PATH,
        checksum: {
          algorithm: 'sha256',
          value: createHash('sha256').update(cohortSnapshot).digest('hex'),
        },
      },
    },
    count: genes.length,
    fitted,
    genes,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload));
  console.log(`Wrote ${genes.length} genes -> ${OUT}`);
  console.log(`  branch model fitted: ${fitted}`);
  console.log(`  PAML status values:  ${statuses.length}`);
  console.log(`  cohort rows:         ${composition.length}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildSelection();
