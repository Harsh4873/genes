export interface PortalAnnotations {
  TBDB?: string;
  REFSEQ?: string;
  PATRIC?: string;
  TUBERCULIST?: string;
  NCBI?: string;
}

export interface PortalPnps {
  overall?: number;
  L1?: number;
  L2?: number;
  L3?: number;
  L4?: number;
}

/** Per-ORF enrichment scraped from the TB Genome Portal gene page. */
export interface PortalGeneEnrichment {
  annotations?: PortalAnnotations;
  pnps?: PortalPnps;
  underSelection?: boolean;
  omegaPeak?: number;
  omegaLower?: number;
  sequence?: string;
}

interface PortalEnrichmentFile {
  source: string;
  builtAt: string;
  count: number;
  genes: Record<string, {
    a?: PortalAnnotations;
    p?: PortalPnps;
    u?: boolean;
    op?: number;
    ol?: number;
    s?: string;
  }>;
}

const DATA_URL = `${import.meta.env.BASE_URL}data/portal-enrichment.json`;

let cache: Map<string, PortalGeneEnrichment> | null = null;
let loadPromise: Promise<Map<string, PortalGeneEnrichment>> | null = null;

function expand(raw: PortalEnrichmentFile['genes'][string]): PortalGeneEnrichment {
  return {
    annotations: raw.a,
    pnps: raw.p,
    underSelection: raw.u,
    omegaPeak: raw.op,
    omegaLower: raw.ol,
    sequence: raw.s,
  };
}

export async function loadPortalEnrichment(): Promise<Map<string, PortalGeneEnrichment>> {
  if (cache) return cache;
  if (!loadPromise) {
    loadPromise = fetch(DATA_URL)
      .then(async (res) => {
        if (!res.ok) throw new Error(`portal enrichment HTTP ${res.status}`);
        const data = (await res.json()) as PortalEnrichmentFile;
        const map = new Map<string, PortalGeneEnrichment>();
        for (const [orf, row] of Object.entries(data.genes ?? {})) map.set(orf, expand(row));
        cache = map;
        return map;
      })
      .catch(() => {
        cache = new Map();
        return cache;
      });
  }
  return loadPromise;
}

export function annotationRows(
  enrichment: PortalGeneEnrichment | null | undefined,
  fallbackProduct: string,
): { source: string; value: string }[] {
  const a = enrichment?.annotations;
  const rows = [
    { source: 'TBDB', value: a?.TBDB },
    { source: 'REFSEQ', value: a?.REFSEQ },
    { source: 'PATRIC', value: a?.PATRIC },
    { source: 'TUBERCULIST', value: a?.TUBERCULIST },
    { source: 'NCBI', value: a?.NCBI },
  ].filter((r): r is { source: string; value: string } => Boolean(r.value));
  if (!rows.length && fallbackProduct) return [{ source: 'Catalog', value: fallbackProduct }];
  return rows;
}

export function formatPnps(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(3);
}
