import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Columns3, Check, Plus, ExternalLink, Link2, TriangleAlert } from 'lucide-react';
import type { Dataset, Gene } from '../lib/types';
import { category } from '../lib/categories';
import { derive } from '../lib/derive';
import { EXTERNAL_LINKS } from '../lib/external';
import { href, navigate } from '../lib/router';
import { fmtCoord, fmtInt, fmtSigned } from '../lib/format';
import { compareStore, useCompare } from '../lib/compareStore';
import { CategoryTag, EssentialityBadge, Provenance, SectionTitle, SourceBadge, StrandBadge } from '../components/common';
import {
  ChromosomeLocus,
  EssentialityConsensus,
  EssentialityDots,
  ExpressionBars,
  ExpressionHighlights,
  GenomeContext,
  PropertyBars,
  TnSeqSketch,
} from '../components/Charts';

const ESS_CALL_CLASS: Record<string, string> = {
  essential: 'ess-essential', 'growth-defect': 'ess-growth-defect', 'non-essential': 'ess-non-essential', uncertain: 'ess-uncertain', 'no-data': 'ess-no-data',
};

export function GeneDetail({ dataset, orf }: { dataset: Dataset; orf: string }) {
  const gene = dataset.byOrf.get(orf);
  const compare = useCompare();
  const [copied, setCopied] = useState(false);

  const geneIndex = useMemo(
    () => (gene ? dataset.genes.findIndex((g) => g.orf === gene.orf) : -1),
    [dataset, gene],
  );

  const neighbors = useMemo(() => {
    if (geneIndex < 0) return [];
    return dataset.genes.slice(Math.max(0, geneIndex - 4), geneIndex + 5);
  }, [dataset, geneIndex]);

  const prevGene = geneIndex > 0 ? dataset.genes[geneIndex - 1] : null;
  const nextGene = geneIndex >= 0 && geneIndex < dataset.genes.length - 1 ? dataset.genes[geneIndex + 1] : null;

  const genomeEnd = useMemo(() => Math.max(...dataset.genes.map((g) => g.end)), [dataset]);

  const modulePeers = useMemo(() => {
    if (!gene) return [] as Gene[];
    const moduleId = derive(gene).module;
    const peers: Gene[] = [];
    for (const g of dataset.genes) {
      if (g.orf === gene.orf) continue;
      if (derive(g).module === moduleId) peers.push(g);
      if (peers.length >= 6) break;
    }
    return peers;
  }, [dataset, gene]);

  if (!gene) {
    return (
      <div className="container">
        <div className="empty-state">
          <TriangleAlert size={30} />
          <h2>No gene “{orf}”</h2>
          <p className="dim">That identifier isn't in the H37Rv catalog. Try a search from the top bar.</p>
          <a className="btn" href={href('browse')} style={{ marginTop: 12 }}><ArrowLeft size={15} /> Back to browser</a>
        </div>
      </div>
    );
  }

  const d = derive(gene);
  const inCompare = compareStore.has(gene.orf);
  const c = category(gene.category);
  const portalHref = EXTERNAL_LINKS.find((l) => l.id === 'tbportal')?.href(gene.orf, gene.gene);
  const topExpr = [...d.expression].sort((a, b) => Math.abs(b.log2fc) - Math.abs(a.log2fc))[0];

  const copyLink = () => {
    navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/gene/${gene.orf}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  };

  return (
    <div className="container">
      <div className="detail-nav">
        <a className="btn btn-ghost btn-sm" href={href('browse')}><ArrowLeft size={15} /> All genes</a>
        <div className="detail-nav-adj">
          {prevGene ? (
            <a className="btn btn-ghost btn-sm" href={href(`gene/${prevGene.orf}`)} title={prevGene.annotation}>
              <ArrowLeft size={14} /> <span className="mono">{prevGene.orf}</span>
              {prevGene.gene ? <span className="accent-text">{prevGene.gene}</span> : null}
            </a>
          ) : <span />}
          {nextGene ? (
            <a className="btn btn-ghost btn-sm" href={href(`gene/${nextGene.orf}`)} title={nextGene.annotation}>
              <span className="mono">{nextGene.orf}</span>
              {nextGene.gene ? <span className="accent-text">{nextGene.gene}</span> : null}
              <ArrowRight size={14} />
            </a>
          ) : null}
        </div>
      </div>

      <div className="detail-head">
        <div className="titleblock">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <CategoryTag id={gene.category} />
            <span className="faint">·</span>
            <EssentialityBadge call={d.essentiality} />
            <span className="faint">·</span>
            <span className="dim" style={{ fontSize: 13 }}>{c.label}</span>
          </div>
          <h1 className="mono"><span>{gene.orf}</span>{gene.gene ? <span className="sym">{gene.gene}</span> : null}</h1>
          <p className="dim" style={{ fontSize: 16, margin: '8px 0 0', maxWidth: '60ch' }}>{gene.annotation}</p>
        </div>
        <div className="detail-actions">
          <button className={inCompare ? 'btn btn-primary' : 'btn'} onClick={() => compareStore.toggle(gene.orf)}>
            {inCompare ? <><Check size={16} /> In comparison</> : <><Plus size={16} /> Add to compare</>}
          </button>
          {compare.length ? <a className="btn" href={href('compare')}><Columns3 size={16} /> {compare.length}</a> : null}
          {portalHref ? <a className="btn" href={portalHref} target="_blank" rel="noopener noreferrer">TB Portal <ExternalLink size={14} /></a> : null}
          <button className="btn btn-ghost" onClick={copyLink} title="Copy link">{copied ? <Check size={16} /> : <Link2 size={16} />}</button>
        </div>
      </div>

      <div className="source-strip" aria-label="Data source summary">
        <SourceBadge kind="reference" />
        <span className="dim">Catalog fields, coordinates, class and external links.</span>
        <SourceBadge kind="representative" />
        <span className="dim">Charts, fitness, protein, GO terms and pathway summaries.</span>
      </div>

      <div className="quick-facts" aria-label="Quick facts">
        <div className="quick-fact">
          <span className="qf-lab">Locus</span>
          <span className="qf-val mono">{fmtCoord(gene.start)}–{fmtCoord(gene.end)} <StrandBadge strand={gene.strand} /></span>
        </div>
        <div className="quick-fact">
          <span className="qf-lab">Length</span>
          <span className="qf-val">{fmtInt(gene.length)} aa · {fmtInt(gene.bp)} bp</span>
        </div>
        <div className="quick-fact">
          <span className="qf-lab">Pathway</span>
          <span className="qf-val">{d.pathway} <SourceBadge kind="representative" compact /></span>
        </div>
        <div className="quick-fact">
          <span className="qf-lab">Top response</span>
          <span className="qf-val">
            {topExpr ? <>{topExpr.label} <span className="tabnum mono">{fmtSigned(topExpr.log2fc)}</span></> : '—'}
            {' '}<SourceBadge kind="representative" compact />
          </span>
        </div>
      </div>

      <div className="divider" />

      <div className="detail-grid">
        <div style={{ display: 'grid', gap: 18 }}>
          <div>
            <SectionTitle aside={<SourceBadge kind="reference" compact />}>Chromosome locus</SectionTitle>
            <div className="card card-pad">
              <ChromosomeLocus start={gene.start} end={gene.end} genomeEnd={genomeEnd} label={gene.gene ?? gene.orf} />
              <p className="panel-note">Position on the circular H37Rv chromosome, shown as a linear map from origin to terminus.</p>
            </div>
          </div>

          <div>
            <SectionTitle aside={<SourceBadge kind="reference" compact />}>Genomic neighbourhood</SectionTitle>
            <div className="card card-pad" style={{ overflowX: 'auto' }}>
              <GenomeContext neighbors={neighbors} focusOrf={gene.orf} onPick={(o) => navigate(`gene/${o}`)} />
              <div className="legend-row" style={{ marginTop: 8 }}>
                <span className="faint" style={{ fontSize: 12 }}>Arrows show strand · select a neighbour to open it · coloured by functional class.</span>
              </div>
            </div>
          </div>

          <div>
            <SectionTitle aside={<><SourceBadge kind="representative" compact /><EssentialityDots rows={d.essentialityRows} /></>}>Essentiality</SectionTitle>
            <div className="card card-pad" style={{ marginBottom: 10 }}>
              <EssentialityConsensus rows={d.essentialityRows} />
              <p className="panel-note">
                Consensus <b className={`ess ${ESS_CALL_CLASS[d.essentiality]}`}>{d.essentiality}</b> from {d.essentialityRows.length} study-style
                panels · {Math.round(d.essentialityConfidence * 100)}% agreement. These calls are representative, not measured for this build.
              </p>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th className="no-sort">Study</th><th className="no-sort">Condition</th><th className="no-sort">Medium</th><th className="no-sort">Method</th><th className="no-sort">Call</th></tr>
                </thead>
                <tbody>
                  {d.essentialityRows.map((r) => (
                    <tr key={r.datasetId} style={{ cursor: 'default' }}>
                      <td style={{ fontWeight: 600 }}>{r.ref}</td>
                      <td className="dim">{r.condition}</td>
                      <td className="dim">{r.medium}</td>
                      <td className="mono dim" style={{ fontSize: 12.5 }}>{r.method}</td>
                      <td><span className={`ess ${ESS_CALL_CLASS[r.call]}`} style={{ gap: 5 }}><span className="dot dot-round" style={{ background: 'currentColor', width: 8, height: 8 }} />{r.call}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <SectionTitle aside={<><SourceBadge kind="representative" compact /><span className="heat-legend"><span>down</span><span className="heat-bar" /><span>up</span></span></>}>
              Transcriptional response
            </SectionTitle>
            <div className="card card-pad">
              <ExpressionHighlights points={d.expression} />
              <div className="divider" style={{ margin: '14px 0' }} />
              <ExpressionBars points={d.expression} />
              <p className="panel-note">
                log₂ fold-change vs exponential-phase reference across stress, growth-state, host and drug conditions.
                Group headers mark the biological axis; values are demonstration profiles seeded from this ORF.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <div className="card card-pad">
            <div className="card-title-row">
              <h4>Catalog record</h4>
              <SourceBadge kind="reference" compact />
            </div>
            <dl className="kv">
              <dt>Locus</dt><dd className="mono">{gene.orf}</dd>
              <dt>Symbol</dt><dd>{gene.gene ?? <span className="faint">unnamed</span>}</dd>
              <dt>Class</dt><dd>{c.label}</dd>
              <dt>Location</dt><dd className="mono">{fmtCoord(gene.start)}–{fmtCoord(gene.end)} <StrandBadge strand={gene.strand} /></dd>
              <dt>Length</dt><dd>{fmtInt(gene.length)} aa · {fmtInt(gene.bp)} bp</dd>
            </dl>
          </div>

          <div className="card card-pad">
            <div className="card-title-row">
              <h4>Pathway context</h4>
              <SourceBadge kind="representative" compact />
            </div>
            <dl className="kv">
              <dt>Pathway</dt><dd>{d.pathway}</dd>
              <dt>Co-expr. module</dt><dd>#{d.module}</dd>
              <dt>Vulnerability</dt><dd className="tabnum">{d.vulnerability}</dd>
            </dl>
            {modulePeers.length ? (
              <div style={{ marginTop: 12 }}>
                <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>Other genes in module #{d.module}</div>
                <div className="peer-chips">
                  {modulePeers.map((g) => (
                    <a key={g.orf} className="chip" href={href(`gene/${g.orf}`)} title={g.annotation}>
                      <span className="mono">{g.orf}</span>
                      {g.gene ? <span style={{ color: 'var(--accent-strong)' }}>{g.gene}</span> : null}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="card card-pad">
            <div className="card-title-row">
              <h4>Fitness & protein</h4>
              <SourceBadge kind="representative" compact />
            </div>
            <div className="metric-grid">
              <div className="metric"><div className="m-num tabnum">{d.tnseq.taSites}</div><div className="m-lab">TA sites</div></div>
              <div className="metric"><div className="m-num tabnum">{d.tnseq.meanInsertions}</div><div className="m-lab">mean insertions</div></div>
              <div className="metric"><div className="m-num tabnum">≈{d.protein.mwKda}</div><div className="m-lab">kDa</div></div>
              <div className="metric"><div className="m-num tabnum">{d.protein.pI}</div><div className="m-lab">pI</div></div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>TnSeq insertion sketch</div>
              <TnSeqSketch saturation={d.tnseq.saturation} taSites={d.tnseq.taSites} essential={d.essentiality === 'essential'} />
              <PropertyBars
                items={[
                  { label: 'TnSeq saturation', value: d.tnseq.saturation, display: `${Math.round(d.tnseq.saturation * 100)}%` },
                  { label: 'Vulnerability index', value: d.vulnerability, color: 'var(--danger)', display: String(d.vulnerability) },
                  {
                    label: 'Hydropathy (GRAVY)',
                    value: (d.protein.gravy + 1.4) / 2.8,
                    display: String(d.protein.gravy),
                    color: 'var(--accent-strong)',
                  },
                ]}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <span className="badge" style={{ background: 'var(--panel-2)', color: 'var(--text-dim)' }}>AlphaFold: {d.protein.alphaFold}</span>
              <span className="badge" style={{ background: 'var(--panel-2)', color: 'var(--text-dim)' }}>{d.protein.pdbHomolog ? 'PDB homolog available' : 'No close PDB homolog'}</span>
              {d.positiveSelection.underSelection ? <span className="badge" style={{ background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}>Positive selection · dN/dS {d.positiveSelection.dnds}</span> : null}
            </div>
            <p className="panel-note">Sparse TnSeq bars usually track essential genes; dense bars track insertable, non-essential loci.</p>
          </div>

          <div className="card card-pad">
            <div className="card-title-row">
              <h4>GO terms</h4>
              <SourceBadge kind="representative" compact />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {d.go.map((g) => <span key={g} className="mono dim" style={{ fontSize: 12.5 }}>{g}</span>)}
            </div>
          </div>

          <div className="card card-pad">
            <div className="card-title-row">
              <h4>External resources</h4>
              <SourceBadge kind="reference" compact />
            </div>
            <div className="ext-links">
              {EXTERNAL_LINKS.map((l) => (
                <a key={l.id} className="ext-link" href={l.href(gene.orf, gene.gene)} target="_blank" rel="noopener noreferrer">
                  <span className="el-name">{l.label} <ExternalLink size={11} style={{ opacity: 0.6 }} /></span>
                  <span className="el-desc">{l.desc}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="section">
        <Provenance>
          The catalog record above (locus, symbol, coordinates, length, product) is from the H37Rv reference annotation. The
          essentiality calls, transcriptional response, TnSeq fitness, and protein biophysics are <b>representative demonstration
          data</b> generated deterministically from this gene — realistic and stable, but not experimental measurements. Follow the
          external links for curated primary data.
        </Provenance>
      </div>
    </div>
  );
}
