import type { PortalGeneEnrichment } from './portalEnrichment';

/** Format only published selection values; missing measurements remain missing. */
export function positiveSelectionSummary(enrichment?: PortalGeneEnrichment): string {
  const peak = Number.isFinite(enrichment?.omegaPeak) ? enrichment?.omegaPeak : undefined;
  const lower = Number.isFinite(enrichment?.omegaLower) ? enrichment?.omegaLower : undefined;
  const selected = enrichment?.underSelection ?? (lower === undefined ? undefined : lower > 1);
  if (selected === undefined && peak === undefined && lower === undefined) return 'Not available';
  return `${selected === undefined ? 'Not available' : selected ? 'YES' : 'NO'} · peak ${peak ?? '—'} (${lower ?? '—'})`;
}
