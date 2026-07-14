import { ExternalLink } from 'lucide-react';
import { SectionTitle, SourceBadge } from '../components/common';

export function About() {
  return (
    <div className="container" style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: 26 }}>About MtbScope</h1>
      <p className="dim" style={{ fontSize: 16, marginTop: 8 }}>
        MtbScope is a leaner mirror of the <a href="https://orca2.tamu.edu/U19/" target="_blank" rel="noopener noreferrer">TB Genome
        Portal <ExternalLink size={12} /></a> for <i>Mycobacterium tuberculosis</i> H37Rv. It keeps the fields people actually look
        up — multi-source annotations, locus, operon, TMHMM, GenomegaMap omega plots, lineage pN/pS, and protein sequence — and
        adds fast search plus a side-by-side compare view.
      </p>

      <div className="section">
        <SectionTitle aside={<SourceBadge kind="reference" />}>What's on each gene page</SectionTitle>
        <ul style={{ lineHeight: 1.75, color: 'var(--text-dim)', paddingLeft: 20 }}>
          <li>Product annotations from TBDB, RefSeq, PATRIC, TubercuList and NCBI (scraped from the portal gene pages).</li>
          <li>Coordinates, length, operon figure, TMHMM topology GIF and GenomegaMap omega PNG from the published portal assets.</li>
          <li>Culviner lineage pN/pS values and amino-acid sequence from the portal enrichment snapshot.</li>
          <li>Working links to variants, the 10k-genome collection, Mycobrowser, KEGG, UniProt and the original portal page.</li>
        </ul>
      </div>

      <div className="section">
        <SectionTitle aside={<SourceBadge kind="representative" />}>What we dropped</SectionTitle>
        <p className="dim">
          Synthetic expression heatmaps, hypoxia panels, demo essentiality tables and other representative analytics are no
          longer shown on gene or compare pages. If a published plot image fails to load, a local TMHMM/omega SVG sketch is
          shown as a labelled fallback only.
        </p>
      </div>

      <div className="section">
        <SectionTitle>How it's built</SectionTitle>
        <p className="dim">
          Static React + TypeScript app. The catalog and portal enrichment load as JSON; search, browse and compare run in the
          browser. Refresh the catalog with <span className="mono">npm run data:refresh</span> and re-scrape portal gene pages
          with <span className="mono">npm run data:enrich</span>.
        </p>
      </div>
    </div>
  );
}
