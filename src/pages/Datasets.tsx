import type { Dataset } from '../lib/types';
import { SectionTitle, Provenance, SourceBadge } from '../components/common';
import { fmtInt } from '../lib/format';
import { portalOmegaCollectionUrl, portalGenomegaMapPaperUrl } from '../lib/portalPlots';

export function Datasets({ dataset }: { dataset: Dataset }) {
  const sourceUrl = dataset.metadata?.source.url ?? 'https://orca2.tamu.edu/U19/pages/H37Rv3.prot_table.html';
  const checksum = dataset.metadata?.snapshot.checksum.value;

  return (
    <div className="container">
      <h1 style={{ fontSize: 26 }}>Datasets</h1>
      <p className="dim" style={{ maxWidth: '64ch', marginTop: 6 }}>
        Source map for the fields MtbScope keeps: the H37Rv catalog snapshot, portal gene-page enrichment, and the published
        TMHMM / GenomegaMap plot assets.
      </p>

      <div className="section">
        <SectionTitle aside={<SourceBadge kind="reference" />}>Reference catalog snapshot</SectionTitle>
        <div className="source-grid">
          <div className="card card-pad source-panel">
            <dl className="kv">
              <dt>Organism</dt><dd>{dataset.organism}</dd>
              <dt>Records</dt><dd className="tabnum">{fmtInt(dataset.count)} protein-coding genes</dd>
              <dt>Source</dt><dd><a href={sourceUrl} target="_blank" rel="noopener noreferrer">TB Genome Portal H37Rv protein table</a></dd>
              <dt>Snapshot</dt><dd className="mono">{dataset.metadata?.snapshot.path ?? 'scripts/source/H37Rv.prot_table.html'}</dd>
              <dt>Checksum</dt><dd className="mono checksum">{checksum ? checksum : 'available after the next catalog rebuild'}</dd>
            </dl>
          </div>
          <div className="card card-pad source-panel">
            <h3>Freshness model</h3>
            <p className="dim">
              <span className="mono">npm run data:check</span> compares the checked-in protein table with the live portal table.
              <span className="mono"> npm run data:enrich</span> re-scrapes per-gene portal pages for annotations, pN/pS and sequence.
            </p>
            <div className="source-actions">
              <a className="btn btn-sm" href={sourceUrl} target="_blank" rel="noopener noreferrer">Open source table</a>
            </div>
          </div>
        </div>
      </div>

      <div className="section">
        <SectionTitle aside={<SourceBadge kind="reference" />}>Portal enrichment</SectionTitle>
        <div className="card card-pad">
          <p className="dim" style={{ marginTop: 0, fontSize: 13.5 }}>
            Stored in <span className="mono">public/data/portal-enrichment.json</span>: TBDB / RefSeq / PATRIC / TubercuList /
            NCBI product strings, Culviner lineage pN/pS, GenomegaMap peak summary, and amino-acid sequence for each ORF.
          </p>
        </div>
      </div>

      <div className="section">
        <SectionTitle aside={<SourceBadge kind="reference" />}>Published plot assets</SectionTitle>
        <div className="card card-pad">
          <ul className="portal-bullets">
            <li>TMHMM GIFs hosted on the TB Genome Portal gene pages.</li>
            <li>
              GenomegaMap omega PNGs and variant lists from the{' '}
              <a href={portalOmegaCollectionUrl()} target="_blank" rel="noopener noreferrer">10,626-genome collection</a>
              {' '}(<a href={portalGenomegaMapPaperUrl()} target="_blank" rel="noopener noreferrer">paper</a>).
            </li>
          </ul>
        </div>
      </div>

      <div className="section">
        <Provenance>
          Gene and compare pages intentionally omit synthetic expression / essentiality demo panels. Follow the portal and
          database links for primary literature and curated tables beyond this mirror.
        </Provenance>
      </div>
    </div>
  );
}
