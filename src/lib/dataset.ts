import { CATEGORIES } from './categories';
import type { CatalogMetadata, Dataset, Gene, RawGene } from './types';

/** Path is resolved against Vite's base ('/genes/') so it works under the subpath. */
const DATA_URL = `${import.meta.env.BASE_URL}data/genes.json`;
const CATEGORY_IDS = new Set<string>(CATEGORIES.map((category) => category.id));

export class DatasetValidationError extends Error {
  constructor(message: string) {
    super(`Invalid gene catalog: ${message}`);
    this.name = 'DatasetValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new DatasetValidationError(message);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') fail(`${key} must be a string`);
  return value;
}

function readInteger(record: Record<string, unknown>, key: string, minimum = 0): number {
  const value = record[key];
  if (!Number.isInteger(value) || (value as number) < minimum) fail(`${key} must be an integer >= ${minimum}`);
  return value as number;
}

function validateMetadata(value: unknown): CatalogMetadata {
  if (!isRecord(value)) fail('metadata must be an object');
  if (!isRecord(value.schema)) fail('metadata.schema must be an object');
  if (!isRecord(value.source)) fail('metadata.source must be an object');
  if (!isRecord(value.snapshot)) fail('metadata.snapshot must be an object');
  if (!isRecord(value.snapshot.checksum)) fail('metadata.snapshot.checksum must be an object');
  const algorithm = readString(value.snapshot.checksum, 'algorithm');
  if (algorithm !== 'sha256') fail('metadata.snapshot.checksum.algorithm must be sha256');
  const checksum = readString(value.snapshot.checksum, 'value');
  if (!/^[a-f0-9]{64}$/i.test(checksum)) fail('metadata.snapshot.checksum.value must be a SHA-256 hex digest');
  return {
    schema: {
      name: readString(value.schema, 'name'),
      version: readInteger(value.schema, 'version', 1),
    },
    source: {
      name: readString(value.source, 'name'),
      url: readString(value.source, 'url'),
    },
    snapshot: {
      path: readString(value.snapshot, 'path'),
      checksum: {
        algorithm,
        value: checksum.toLowerCase(),
      },
    },
  };
}

function validateRawGene(value: unknown, index: number): RawGene {
  if (!isRecord(value)) fail(`genes[${index}] must be an object`);
  const prefix = `genes[${index}]`;
  const o = readString(value, 'o').trim();
  if (!o) fail(`${prefix}.o must not be empty`);
  const g = value.g;
  if (g !== null && typeof g !== 'string') fail(`${prefix}.g must be a string or null`);
  const s = readInteger(value, 's', 1);
  const e = readInteger(value, 'e', 1);
  const l = readInteger(value, 'l', 0);
  if (value.d !== '+' && value.d !== '-') fail(`${prefix}.d must be "+" or "-"`);
  const a = readString(value, 'a');
  const c = readString(value, 'c');
  if (!CATEGORY_IDS.has(c)) fail(`${prefix}.c is not a known category`);
  return { o, g, s, e, d: value.d, l, a, c: c as RawGene['c'] };
}

function expand(r: RawGene): Gene {
  return {
    orf: r.o,
    gene: r.g,
    name: r.g ?? r.o,
    start: r.s,
    end: r.e,
    strand: r.d,
    length: r.l,
    bp: Math.abs(r.e - r.s) + 1,
    annotation: r.a,
    category: r.c,
  };
}

/** Validate untrusted JSON before any page assumes its shape or invariants. */
export function validateDataset(value: unknown): Dataset {
  if (!isRecord(value)) fail('root must be an object');
  const organism = readString(value, 'organism');
  const source = readString(value, 'source');
  const note = readString(value, 'note');
  const metadata = value.metadata === undefined ? undefined : validateMetadata(value.metadata);
  // Current pages calculate ranges and summary statistics that require at
  // least one record; reject an empty payload instead of rendering NaN values.
  const count = readInteger(value, 'count', 1);
  if (!Array.isArray(value.genes)) fail('genes must be an array');
  if (value.genes.length !== count) fail(`count (${count}) does not match genes.length (${value.genes.length})`);
  if (!isRecord(value.categories)) fail('categories must be an object');

  const categories: Record<string, number> = {};
  for (const [id, categoryCount] of Object.entries(value.categories)) {
    if (!CATEGORY_IDS.has(id)) fail(`categories.${id} is not a known category`);
    if (!Number.isInteger(categoryCount) || (categoryCount as number) < 0) {
      fail(`categories.${id} must be a non-negative integer`);
    }
    categories[id] = categoryCount as number;
  }

  const genes = value.genes.map(validateRawGene).map(expand);
  const byOrf = new Map<string, Gene>();
  const actualCategories: Record<string, number> = {};
  for (const gene of genes) {
    if (byOrf.has(gene.orf)) fail(`duplicate gene identifier "${gene.orf}"`);
    byOrf.set(gene.orf, gene);
    actualCategories[gene.category] = (actualCategories[gene.category] ?? 0) + 1;
  }

  const declaredTotal = Object.values(categories).reduce((sum, categoryCount) => sum + categoryCount, 0);
  if (declaredTotal !== count) fail(`category total (${declaredTotal}) does not match count (${count})`);
  for (const [id, actual] of Object.entries(actualCategories)) {
    if (categories[id] !== actual) fail(`categories.${id} (${categories[id] ?? 0}) does not match genes (${actual})`);
  }

  return { metadata, organism, source, note, count, categories, genes, byOrf };
}

let promise: Promise<Dataset> | null = null;

export interface LoadDatasetOptions {
  /** Bypass the in-memory result and the browser's normal HTTP cache. */
  force?: boolean;
}

export function resetDatasetCache(): void {
  promise = null;
}

export function loadDataset(options: LoadDatasetOptions = {}): Promise<Dataset> {
  if (promise && !options.force) return promise;

  const request = fetch(DATA_URL, options.force ? { cache: 'reload' } : undefined)
    .then((response) => {
      if (!response.ok) throw new Error(`Failed to load gene catalog (${response.status})`);
      return response.json() as Promise<unknown>;
    })
    .then(validateDataset);

  promise = request;
  void request.catch(() => {
    // A transient failure must not poison all future retries. Guard against an
    // older forced request clearing a newer in-flight request.
    if (promise === request) promise = null;
  });
  return request;
}
