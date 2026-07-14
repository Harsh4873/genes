// Stable deep-links into published TB Genome Portal / GenomegaMap assets.
// These are the same plot files the official gene pages embed.

const PORTAL_PAGES = 'https://orca2.tamu.edu/U19/pages';
const OMEGA_BASE = 'https://orca1.tamu.edu/selection/mtb_genomes.10k';

export function portalGenePage(orf: string): string {
  return `${PORTAL_PAGES}/${encodeURIComponent(orf)}.html`;
}

/** TMHMM posterior-probability GIF embedded on each portal gene page. */
export function portalTmhmmUrl(orf: string): string {
  return `${PORTAL_PAGES}/images/${encodeURIComponent(orf)}.gif`;
}

/** GenomegaMap omega (dN/dS) plot for the global 10k clinical-isolate set. */
export function portalOmegaPlotUrl(orf: string): string {
  return `${OMEGA_BASE}/output/${encodeURIComponent(orf)}.omega_plot.png`;
}

/** Per-gene genetic-variant listing paired with the omega analysis. */
export function portalVariantsUrl(orf: string): string {
  return `${OMEGA_BASE}/output/${encodeURIComponent(orf)}.variants.txt`;
}

export function portalOmegaCollectionUrl(): string {
  return `${OMEGA_BASE}/index.html`;
}

export function portalGenomegaMapPaperUrl(): string {
  return 'https://pubmed.ncbi.nlm.nih.gov/32167543/';
}

export function portalOperonUrl(orf: string): string {
  return `${PORTAL_PAGES}/images/operon_images/${encodeURIComponent(orf)}.svg`;
}
