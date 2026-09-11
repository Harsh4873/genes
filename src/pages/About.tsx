import { ExternalLink } from 'lucide-react';
import { href } from '../lib/router';
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
          <li>Working links to variants, the 10k-genome collection, Mycobrowser, KEGG, UniProt, AlphaFold DB, STRING, NCBI and the original portal page.</li>
          <li>Literature on the gene page and in GeneLookup, with PubMed / PMC / DOI links and UniProt citations when an accession is known.</li>
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
        <SectionTitle aside={<SourceBadge kind="study" />}>The Selection Lab</SectionTitle>
        <p className="dim">
          The <a className="accent" href={href('selection')}>Selection Lab</a> is the exception to everything above: it carries
          real analysis output from a study in preparation rather than portal assets or demonstration data, so it is{' '}
          <b>access controlled</b>.
        </p>
        <p className="dim">
          There is no server here to check a password against, so the dataset itself is published encrypted (AES-256-GCM, with
          the key derived from a passphrase by PBKDF2-SHA256 over 600,000 iterations). The passphrase never leaves the device:
          it derives the key in the browser, and without it the published file is ciphertext. Everything else in MtbScope is
          open as usual.
        </p>
      </div>

      <div className="section">
        <SectionTitle>How it's built</SectionTitle>
        <p className="dim">
          Static React + TypeScript app. The catalog, portal enrichment and selection dataset load as JSON; search, browse,
          compare and the whole Lab run in the browser. Refresh the catalog with <span className="mono">npm run data:refresh</span>,
          re-scrape portal gene pages with <span className="mono">npm run data:enrich</span>, and rebuild the selection dataset
          from its snapshot with <span className="mono">npm run build:selection</span>.
        </p>
      </div>
    </div>
  );
}
