import type { PortalGeneEnrichment } from './portalEnrichment';

export interface PositiveSelectionFields {
  selected: boolean | undefined;
  peak: number | undefined;
  lower: number | undefined;
}

/** Published selection fields only. Missing measurements stay missing. */
export function positiveSelectionFields(enrichment?: PortalGeneEnrichment): PositiveSelectionFields {
  const peak = Number.isFinite(enrichment?.omegaPeak) ? enrichment?.omegaPeak : undefined;
  const lower = Number.isFinite(enrichment?.omegaLower) ? enrichment?.omegaLower : undefined;
  const selected = enrichment?.underSelection ?? (lower === undefined ? undefined : lower > 1);
  return { selected, peak, lower };
}

/** Format only published selection values; missing measurements remain missing. */
export function positiveSelectionSummary(enrichment?: PortalGeneEnrichment): string {
  const { selected, peak, lower } = positiveSelectionFields(enrichment);
  if (selected === undefined && peak === undefined && lower === undefined) return 'Not available';
  return `${selected === undefined ? 'Not available' : selected ? 'YES' : 'NO'} · peak ${peak ?? '—'} (${lower ?? '—'})`;
}
