import type { Dataset } from '../lib/types';
import { CONDITIONS, ESSENTIALITY_DATASETS } from '../lib/conditions';
import { SectionTitle, Provenance, SourceBadge } from '../components/common';
import { fmtInt } from '../lib/format';

const GROUP_COLOR: Record<string, string> = {
  Stress: '#e0567a', 'Growth state': '#5b8def', Host: '#22b8a6', Drug: '#f2994a',
};

export function Datasets({ dataset }: { dataset: Dataset }) {
  const sourceUrl = dataset.metadata?.source.url ?? 'https://orca2.tamu.edu/U19/pages/H37Rv3.prot_table.html';
  const checksum = dataset.metadata?.snapshot.checksum.value;

  return (
    <div className="container">
      <h1 style={{ fontSize: 26 }}>Datasets</h1>
      <p className="dim" style={{ maxWidth: '64ch', marginTop: 6 }}>
        MtbScope separates the reviewed reference catalog from representative analytical panels. This page is the source map:
        what is real annotation, what is demonstration data, and how the snapshot stays checkable.
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
              The site ships a reviewed static JSON catalog. A scheduled check fetches the official portal protein table and
              compares its bytes with the checked-in snapshot. When upstream changes, the refresh command rebuilds the snapshot
              and catalog together so the website stays reproducible.
            </p>
            <div className="source-actions">
              <a className="btn btn-sm" href={sourceUrl} target="_blank" rel="noopener noreferrer">Open source table</a>
              <span className="badge">Read-only check: <span className="mono">npm run data:check</span></span>
            </div>
          </div>
        </div>
      </div>

      <div className="section">
        <SectionTitle aside={<SourceBadge kind="representative" />}>Essentiality &amp; fitness (TnSeq)</SectionTitle>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th className="no-sort">Study</th><th className="no-sort">Condition</th><th className="no-sort">Medium / host</th><th className="no-sort">Method</th></tr>
            </thead>
            <tbody>
              {ESSENTIALITY_DATASETS.map((d) => (
                <tr key={d.id} style={{ cursor: 'default' }}>
                  <td style={{ fontWeight: 600 }}>{d.ref}</td>
                  <td className="dim">{d.condition}</td>
                  <td className="dim">{d.medium}</td>
                  <td className="mono dim" style={{ fontSize: 12.5 }}>{d.method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="dim" style={{ fontSize: 13, marginTop: 8 }}>
          Transposon-insertion sequencing (Tn-Seq / TraSH) saturates the genome with insertions; genes that cannot tolerate
          them are inferred to be required for growth in that condition.
        </p>
      </div>

      <div className="section">
        <SectionTitle aside={<SourceBadge kind="representative" />}>Transcriptional response panel</SectionTitle>
        <div className="card card-pad">
          <p className="dim" style={{ marginTop: 0, fontSize: 13.5 }}>
            Expression fold-changes are reported across {CONDITIONS.length} conditions spanning stress, growth state, host and
            drug exposure — the classic axes probed by H37Rv microarray and RNA-seq stress panels.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginTop: 6 }}>
            {CONDITIONS.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', background: 'var(--panel-2)', borderRadius: 8 }}>
                <span className="dot" style={{ background: GROUP_COLOR[c.group] }} />
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{c.label}</span>
                <span className="faint" style={{ marginLeft: 'auto', fontSize: 11.5 }}>{c.group}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section">
        <Provenance>
          The catalog snapshot above is the reference annotation. The per-gene values in the essentiality, expression, fitness,
          protein, vulnerability, pathway and module panels are <b>representative demonstration data</b>, not the primary
          measurements from those studies. Use the external database links on any gene page to reach curated primary data.
        </Provenance>
      </div>
    </div>
  );
}
