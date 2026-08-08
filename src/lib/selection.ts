// Loader and validator for the differential-selection dataset (DB vs NDB).
//
// The payload carries measured quantities only. Ratios, P-values, ranks by any
// live threshold and every significance call are derived in selectionStats.ts,
// so the numbers on screen can always be traced back to a count, a posterior
// summary, or a model fit in this file.
//
// The study is unpublished, so what ships is encrypted (see lib/lockbox.ts):
// the fetch returns an envelope, and a passphrase turns it into the JSON this
// module validates.

import { isEnvelope, unlock, type Envelope } from './lockbox';

/** Compact per-gene record as stored in selection.json. */
export interface RawSelectionGene {
  o: string; // ORF id
  n: string | null; // gene symbol
  aa: number | null; // codons analysed (protein length without the stop codon)
  ss: number | null; // possible synonymous sites
  sn: number | null; // possible nonsynonymous sites
  fam: string | null; // PE / PPE / PE_PGRS family
  dpd: number | null; // P(omega_DB > omega_NDB)
  dr: number | null; // published DPD rank
  wd: number | null; // posterior mean omega, diabetes
  wdl: number | null; // 2.5th percentile
  wdh: number | null; // 97.5th percentile
  wn: number | null; // posterior mean omega, non-diabetes
  wnl: number | null;
  wnh: number | null;
  ds: number | null; // DB synonymous count
  dn: number | null; // DB nonsynonymous count
  ns: number | null; // NDB synonymous count
  nn: number | null; // NDB nonsynonymous count
  al: number | null; // distinct alleles across the 922 pooled isolates
  pd: number | null; // published DB pN/pS
  pn: number | null; // published NDB pN/pS
  dl: number | null; // published delta log2 pN/pS
  dlr: number | null; // published rank on that difference
  x2: number | null; // Pearson chi-square
  x2r: number | null; // published chi-square rank
  pst: number | null; // index into metadata.pamlStatuses
  pwd: number | null; // codeml omega, diabetes clade
  pwn: number | null; // codeml omega, non-diabetes clade
  pll: number | null; // signed 2dLL, positive when omega is higher in diabetes
  ph: number | null; // haplotypes the branch model was fitted on
}

export interface CohortShare {
  facet: string;
  group: string;
  db: number;
  ndb: number;
}

export interface SelectionMetadata {
  schema: { name: string; version: number };
  study: { title: string; status: string; note: string };
  cohorts: {
    db: number;
    ndb: number;
    total: number;
    dbLabel: string;
    ndbLabel: string;
    sources: string;
    filters: string;
  };
  composition: CohortShare[];
  methods: Record<string, string>;
  criteria: Record<string, string>;
  pamlStatuses: string[];
  snapshot: { path: string; checksum: { algorithm: 'sha256'; value: string } };
  cohortSnapshot: { path: string; checksum: { algorithm: 'sha256'; value: string } };
}

/** Expanded record used across the Selection Lab. */
export interface SelectionGene {
  orf: string;
  gene: string | null;
  name: string;
  codons: number | null;
  synSites: number | null;
  nsynSites: number | null;
  family: string | null;
  /** True for PE, PPE and PE_PGRS genes, which are excluded from allele counts. */
  repetitive: boolean;
  dpd: number | null;
  dpdRank: number | null;
  omegaDb: number | null;
  omegaDbLo: number | null;
  omegaDbHi: number | null;
  omegaNdb: number | null;
  omegaNdbLo: number | null;
  omegaNdbHi: number | null;
  counts: { dbSyn: number; dbNsyn: number; ndbSyn: number; ndbNsyn: number } | null;
  alleles: number | null;
  publishedPnPsDb: number | null;
  publishedPnPsNdb: number | null;
  publishedDeltaLog2: number | null;
  deltaLog2Rank: number | null;
  chiSq: number | null;
  chiSqRank: number | null;
  pamlStatus: string | null;
  /** The branch model produced a usable fit for this gene. */
  pamlFitted: boolean;
  pamlOmegaDb: number | null;
  pamlOmegaNdb: number | null;
  /** 2dLL signed by sign(omega_DB - omega_NDB). */
  pamlSigned2LL: number | null;
  pamlHaplotypes: number | null;
}

export interface SelectionDataset {
  metadata: SelectionMetadata;
  count: number;
  fitted: number;
  genes: SelectionGene[];
  byOrf: Map<string, SelectionGene>;
}

export class SelectionValidationError extends Error {
  constructor(message: string) {
    super(`Invalid selection dataset: ${message}`);
    this.name = 'SelectionValidationError';
  }
}

function fail(message: string): never {
  throw new SelectionValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(record: Record<string, unknown>, key: string, where: string): string {
  const value = record[key];
  if (typeof value !== 'string') fail(`${where}.${key} must be a string`);
  return value;
}

function int(record: Record<string, unknown>, key: string, where: string, minimum = 0): number {
  const value = record[key];
  if (!Number.isInteger(value) || (value as number) < minimum) fail(`${where}.${key} must be an integer >= ${minimum}`);
  return value as number;
}

/** Numbers arrive from an offline pipeline; a null means "not measured". */
function maybeNumber(record: Record<string, unknown>, key: string, where: string): number | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${where}.${key} must be a finite number or null`);
  return value;
}

function maybeString(record: Record<string, unknown>, key: string, where: string): string | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') fail(`${where}.${key} must be a string or null`);
  return value;
}

function checksum(value: unknown, where: string): { algorithm: 'sha256'; value: string } {
  if (!isRecord(value)) fail(`${where} must be an object`);
  const algorithm = str(value, 'algorithm', where);
  if (algorithm !== 'sha256') fail(`${where}.algorithm must be sha256`);
  const digest = str(value, 'value', where);
  if (!/^[a-f0-9]{64}$/i.test(digest)) fail(`${where}.value must be a SHA-256 hex digest`);
  return { algorithm, value: digest.toLowerCase() };
}

function snapshot(value: unknown, where: string): SelectionMetadata['snapshot'] {
  if (!isRecord(value)) fail(`${where} must be an object`);
  return { path: str(value, 'path', where), checksum: checksum(value.checksum, `${where}.checksum`) };
}

function stringMap(value: unknown, where: string): Record<string, string> {
  if (!isRecord(value)) fail(`${where} must be an object`);
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') fail(`${where}.${key} must be a string`);
    out[key] = entry;
  }
  return out;
}

function validateMetadata(value: unknown): SelectionMetadata {
  if (!isRecord(value)) fail('metadata must be an object');
  if (!isRecord(value.schema)) fail('metadata.schema must be an object');
  if (!isRecord(value.study)) fail('metadata.study must be an object');
  if (!isRecord(value.cohorts)) fail('metadata.cohorts must be an object');
  if (!Array.isArray(value.composition)) fail('metadata.composition must be an array');
  if (!Array.isArray(value.pamlStatuses)) fail('metadata.pamlStatuses must be an array');

  const cohorts = value.cohorts;
  const db = int(cohorts, 'db', 'metadata.cohorts', 1);
  const ndb = int(cohorts, 'ndb', 'metadata.cohorts', 1);
  const total = int(cohorts, 'total', 'metadata.cohorts', 1);
  if (db + ndb !== total) fail(`metadata.cohorts.total (${total}) is not db + ndb (${db + ndb})`);

  const composition = value.composition.map((entry, index) => {
    const where = `metadata.composition[${index}]`;
    if (!isRecord(entry)) fail(`${where} must be an object`);
    return {
      facet: str(entry, 'facet', where),
      group: str(entry, 'group', where),
      db: int(entry, 'db', where),
      ndb: int(entry, 'ndb', where),
    };
  });

  const pamlStatuses = value.pamlStatuses.map((entry, index) => {
    if (typeof entry !== 'string') fail(`metadata.pamlStatuses[${index}] must be a string`);
    return entry;
  });

  return {
    schema: { name: str(value.schema, 'name', 'metadata.schema'), version: int(value.schema, 'version', 'metadata.schema', 1) },
    study: {
      title: str(value.study, 'title', 'metadata.study'),
      status: str(value.study, 'status', 'metadata.study'),
      note: str(value.study, 'note', 'metadata.study'),
    },
    cohorts: {
      db,
      ndb,
      total,
      dbLabel: str(cohorts, 'dbLabel', 'metadata.cohorts'),
      ndbLabel: str(cohorts, 'ndbLabel', 'metadata.cohorts'),
      sources: str(cohorts, 'sources', 'metadata.cohorts'),
      filters: str(cohorts, 'filters', 'metadata.cohorts'),
    },
    composition,
    methods: stringMap(value.methods, 'metadata.methods'),
    criteria: stringMap(value.criteria, 'metadata.criteria'),
    pamlStatuses,
    snapshot: snapshot(value.snapshot, 'metadata.snapshot'),
    cohortSnapshot: snapshot(value.cohortSnapshot, 'metadata.cohortSnapshot'),
  };
}

const REPETITIVE = /^(PE|PPE|PE_PGRS)$/;

function expand(raw: RawSelectionGene, statuses: string[], index: number): SelectionGene {
  const where = `genes[${index}]`;
  const status = raw.pst === null ? null : statuses[raw.pst];
  if (raw.pst !== null && status === undefined) fail(`${where}.pst is not a known PAML status index`);
  const counts =
    raw.ds === null || raw.dn === null || raw.ns === null || raw.nn === null
      ? null
      : { dbSyn: raw.ds, dbNsyn: raw.dn, ndbSyn: raw.ns, ndbNsyn: raw.nn };
  return {
    orf: raw.o,
    gene: raw.n,
    name: raw.n ?? raw.o,
    codons: raw.aa,
    synSites: raw.ss,
    nsynSites: raw.sn,
    family: raw.fam,
    repetitive: raw.fam !== null && REPETITIVE.test(raw.fam),
    dpd: raw.dpd,
    dpdRank: raw.dr,
    omegaDb: raw.wd,
    omegaDbLo: raw.wdl,
    omegaDbHi: raw.wdh,
    omegaNdb: raw.wn,
    omegaNdbLo: raw.wnl,
    omegaNdbHi: raw.wnh,
    counts,
    alleles: raw.al,
    publishedPnPsDb: raw.pd,
    publishedPnPsNdb: raw.pn,
    publishedDeltaLog2: raw.dl,
    deltaLog2Rank: raw.dlr,
    chiSq: raw.x2,
    chiSqRank: raw.x2r,
    pamlStatus: status ?? null,
    pamlFitted: status === 'ok' && raw.pll !== null,
    pamlOmegaDb: raw.pwd,
    pamlOmegaNdb: raw.pwn,
    pamlSigned2LL: raw.pll,
    pamlHaplotypes: raw.ph,
  };
}

function validateRawGene(value: unknown, index: number): RawSelectionGene {
  const where = `genes[${index}]`;
  if (!isRecord(value)) fail(`${where} must be an object`);
  const orf = str(value, 'o', where).trim();
  if (!orf) fail(`${where}.o must not be empty`);
  const numeric = (key: string) => maybeNumber(value, key, where);
  const pst = numeric('pst');
  if (pst !== null && !Number.isInteger(pst)) fail(`${where}.pst must be an integer or null`);
  return {
    o: orf,
    n: maybeString(value, 'n', where),
    aa: numeric('aa'),
    ss: numeric('ss'),
    sn: numeric('sn'),
    fam: maybeString(value, 'fam', where),
    dpd: numeric('dpd'),
    dr: numeric('dr'),
    wd: numeric('wd'),
    wdl: numeric('wdl'),
    wdh: numeric('wdh'),
    wn: numeric('wn'),
    wnl: numeric('wnl'),
    wnh: numeric('wnh'),
    ds: numeric('ds'),
    dn: numeric('dn'),
    ns: numeric('ns'),
    nn: numeric('nn'),
    al: numeric('al'),
    pd: numeric('pd'),
    pn: numeric('pn'),
    dl: numeric('dl'),
    dlr: numeric('dlr'),
    x2: numeric('x2'),
    x2r: numeric('x2r'),
    pst,
    pwd: numeric('pwd'),
    pwn: numeric('pwn'),
    pll: numeric('pll'),
    ph: numeric('ph'),
  };
}

export function validateSelection(value: unknown): SelectionDataset {
  if (!isRecord(value)) fail('root must be an object');
  const metadata = validateMetadata(value.metadata);
  const count = int(value, 'count', 'root', 1);
  const fitted = int(value, 'fitted', 'root');
  if (!Array.isArray(value.genes)) fail('genes must be an array');
  if (value.genes.length !== count) fail(`count (${count}) does not match genes.length (${value.genes.length})`);

  const genes = value.genes.map(validateRawGene).map((raw, index) => expand(raw, metadata.pamlStatuses, index));
  const byOrf = new Map<string, SelectionGene>();
  for (const gene of genes) {
    if (byOrf.has(gene.orf)) fail(`duplicate gene identifier "${gene.orf}"`);
    byOrf.set(gene.orf, gene);
  }

  const actualFitted = genes.filter((gene) => gene.pamlFitted).length;
  if (actualFitted !== fitted) fail(`fitted (${fitted}) does not match the branch-model fits (${actualFitted})`);

  return { metadata, count, fitted, genes, byOrf };
}

const DATA_URL = `${import.meta.env.BASE_URL}data/selection.enc`;

let envelopePromise: Promise<Envelope> | null = null;
let unlocked: SelectionDataset | null = null;

export function resetSelectionCache(): void {
  envelopePromise = null;
  unlocked = null;
}

/** The decrypted dataset, if this tab has already opened it. */
export function unlockedSelection(): SelectionDataset | null {
  return unlocked;
}

function fetchEnvelope(force: boolean): Promise<Envelope> {
  if (envelopePromise && !force) return envelopePromise;
  const request = fetch(DATA_URL, force ? { cache: 'reload' } : undefined)
    .then((response) => {
      if (!response.ok) throw new Error(`Failed to load the selection dataset (${response.status})`);
      return response.json() as Promise<unknown>;
    })
    .then((value) => {
      if (!isEnvelope(value)) throw new Error('The published selection dataset is not in the expected format.');
      return value;
    });
  envelopePromise = request;
  void request.catch(() => {
    if (envelopePromise === request) envelopePromise = null;
  });
  return request;
}

/**
 * Lazy and locked: the payload is only fetched when the Lab opens, and it is
 * ciphertext until a passphrase opens it. Throws LockedError for a wrong
 * passphrase, so the caller can tell that apart from a network failure.
 */
export async function loadSelection(passphrase: string, options: { force?: boolean } = {}): Promise<SelectionDataset> {
  if (unlocked && !options.force) return unlocked;
  const envelope = await fetchEnvelope(options.force === true);
  const json = await unlock(envelope, passphrase);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error('The decrypted selection dataset is not valid JSON.');
  }
  unlocked = validateSelection(parsed);
  return unlocked;
}
