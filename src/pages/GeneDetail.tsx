import { useMemo, useState, Fragment } from 'react';
import { ArrowLeft, ArrowRight, Columns3, Check, Plus, ExternalLink, Link2, TriangleAlert } from 'lucide-react';
import type { Dataset } from '../lib/types';
import { category } from '../lib/categories';
import { EXTERNAL_LINKS } from '../lib/external';
import { href } from '../lib/router';
import { fmtCoord, fmtInt } from '../lib/format';
import { compareStore, useCompare } from '../lib/compareStore';
import { annotationRows, formatPnps } from '../lib/portalEnrichment';
import { usePortalEnrichment } from '../lib/usePortalEnrichment';
import { CategoryTag, Provenance, SectionTitle, SourceBadge, StrandBadge } from '../components/common';
import { OmegaPlot, TmhmmPlot } from '../components/Charts';
import { PortalFigure } from '../components/PortalFigure';
import { derive } from '../lib/derive';
import {
  portalGenePage,
  portalGenomegaMapPaperUrl,
  portalOmegaCollectionUrl,
  portalOmegaPlotUrl,
  portalOperonUrl,
  portalTmhmmUrl,
  portalVariantsUrl,
} from '../lib/portalPlots';

function formatSequence(seq: string): string {
  return seq.match(/.{1,60}/g)?.join('\n') ?? seq;
}

export function GeneDetail({ dataset, orf }: { dataset: Dataset; orf: string }) {
  const gene = dataset.byOrf.get(orf);
  const compare = useCompare();
  const [copied, setCopied] = useState(false);
  const { enrichment, loading } = usePortalEnrichment(gene?.orf);

  const geneIndex = useMemo(
    () => (gene ? dataset.genes.findIndex((g) => g.orf === gene.orf) : -1),
    [dataset, gene],
  );
  const prevGene = geneIndex > 0 ? dataset.genes[geneIndex - 1] : null;
  const nextGene = geneIndex >= 0 && geneIndex < dataset.genes.length - 1 ? dataset.genes[geneIndex + 1] : null;

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
  const ann = annotationRows(enrichment, gene.annotation);
  const underSelection = enrichment?.underSelection ?? (enrichment?.omegaLower !== undefined ? enrichment.omegaLower > 1 : d.positiveSelection.underSelection);
  const peak = enrichment?.omegaPeak ?? d.positiveSelection.peakOmega;
  const peakLower = enrichment?.omegaLower ?? d.positiveSelection.peakLowerCi;
  const sequence = enrichment?.sequence;
  const pnps = enrichment?.pnps;

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
        <span className="dim">Annotations, coordinates, TMHMM, GenomegaMap plots, sequence and pN/pS from the portal snapshot.</span>
      </div>

      <div className="divider" />

      <div className="detail-grid">
        <div style={{ display: 'grid', gap: 18 }}>
          <div>
            <SectionTitle aside={<SourceBadge kind="reference" compact />}>Current annotations</SectionTitle>
            <div className="card card-pad">
              {loading && !enrichment ? <p className="dim">Loading portal annotations…</p> : null}
              <dl className="kv">
                <dt>TBCAP</dt>
                <dd className="dim">
                  <a href={`${portalGenePage(gene.orf)}#TBCAP`} target="_blank" rel="noopener noreferrer">
                    Community annotations on portal <ExternalLink size={12} />
                  </a>
                </dd>
                {ann.map((row) => (
                  <Fragment key={row.source}>
                    <dt>{row.source}</dt>
                    <dd>{row.value}</dd>
                  </Fragment>
                ))}
              </dl>
            </div>
          </div>

          <div>
            <SectionTitle aside={<SourceBadge kind="reference" compact />}>Locus</SectionTitle>
            <div className="card card-pad">
              <dl className="kv">
                <dt>Coordinates in H37Rv</dt>
                <dd className="mono">{fmtCoord(gene.start)} – {fmtCoord(gene.end)} <StrandBadge strand={gene.strand} /></dd>
                <dt>Gene length</dt>
                <dd>{fmtInt(gene.bp)} bp (with stop) · {fmtInt(gene.length)} aa</dd>
                <dt>Gene name</dt>
                <dd>{gene.gene ?? <span className="faint">—</span>}</dd>
              </dl>
            </div>
          </div>

          <div>
            <SectionTitle aside={<SourceBadge kind="reference" compact />}>Operon</SectionTitle>
            <div className="card card-pad">
              <PortalFigure
                src={portalOperonUrl(gene.orf).replace(/\.svg$/, '.png')}
                alt={`Operon context for ${gene.orf}`}
                href={portalGenePage(gene.orf)}
                fallback={
                  <img
                    className="portal-figure-img"
                    src={portalOperonUrl(gene.orf)}
                    alt={`Operon SVG for ${gene.orf}`}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                }
                caption={<span className="dim">Operon figure from the TB Genome Portal gene page.</span>}
              />
            </div>
          </div>

          <div>
            <SectionTitle aside={<SourceBadge kind="reference" compact />}>Trans-membrane region (TMHMM)</SectionTitle>
            <div className="card card-pad">
              <PortalFigure
                src={portalTmhmmUrl(gene.orf)}
                alt={`TMHMM posterior probabilities for ${gene.orf}`}
                href={portalGenePage(gene.orf)}
                fallback={<TmhmmPlot profile={d.tmhmm} orf={gene.orf} />}
              />
            </div>
          </div>

          <div>
            <SectionTitle aside={<SourceBadge kind="reference" compact />}>Positive selection (GenomegaMap)</SectionTitle>
            <div className="card card-pad">
              <ul className="portal-bullets">
                <li>
                  dN/dS (omega) across{' '}
                  <a href={portalOmegaCollectionUrl()} target="_blank" rel="noopener noreferrer">10,626 Mtb genomes</a>
                  {' '}using{' '}
                  <a href={portalGenomegaMapPaperUrl()} target="_blank" rel="noopener noreferrer">GenomegaMap</a>.
                </li>
                <li>Significant positive selection only if the lower 95% CI exceeds 1.0 at any codon.</li>
              </ul>
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="table portal-summary-table">
                  <tbody>
                    <tr style={{ cursor: 'default' }}>
                      <td>Under significant positive selection?</td>
                      <td><b>{underSelection ? 'YES' : 'NO'}</b></td>
                    </tr>
                    <tr style={{ cursor: 'default' }}>
                      <td>Omega peak height (95% CI lower bound)</td>
                      <td className="tabnum">{peak} ({peakLower})</td>
                    </tr>
                    <tr style={{ cursor: 'default' }}>
                      <td>Genetic variants</td>
                      <td>
                        <a href={portalVariantsUrl(gene.orf)} target="_blank" rel="noopener noreferrer">
                          Open variants list <ExternalLink size={12} />
                        </a>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 14 }}>
                <PortalFigure
                  src={portalOmegaPlotUrl(gene.orf)}
                  alt={`Omega dN/dS plot for ${gene.orf}`}
                  href={portalOmegaPlotUrl(gene.orf)}
                  fallback={<OmegaPlot series={d.positiveSelection.series} orf={gene.orf} />}
                />
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <div className="card card-pad">
            <div className="card-title-row">
              <h4>pN/pS (Culviner et al.)</h4>
              <SourceBadge kind="reference" compact />
            </div>
            {pnps ? (
              <dl className="kv">
                <dt>Overall</dt><dd className="tabnum">{formatPnps(pnps.overall)}</dd>
                <dt>Lineage L1</dt><dd className="tabnum">{formatPnps(pnps.L1)}</dd>
                <dt>Lineage L2</dt><dd className="tabnum">{formatPnps(pnps.L2)}</dd>
                <dt>Lineage L3</dt><dd className="tabnum">{formatPnps(pnps.L3)}</dd>
                <dt>Lineage L4</dt><dd className="tabnum">{formatPnps(pnps.L4)}</dd>
              </dl>
            ) : (
              <p className="dim" style={{ margin: 0, fontSize: 13.5 }}>
                {loading ? 'Loading lineage pN/pS…' : 'pN/pS not in the local enrichment snapshot yet — open the TB Portal gene page.'}
              </p>
            )}
          </div>

          <div className="card card-pad">
            <div className="card-title-row">
              <h4>Amino acid sequence</h4>
              <SourceBadge kind="reference" compact />
            </div>
            {sequence ? (
              <pre className="seq">{formatSequence(sequence)}</pre>
            ) : (
              <p className="dim" style={{ margin: 0, fontSize: 13.5 }}>
                {loading ? 'Loading sequence…' : (
                  <>
                    Sequence not cached locally.{' '}
                    <a href={`https://www.genome.jp/dbget-bin/www_bget?mtu:${gene.orf}`} target="_blank" rel="noopener noreferrer">
                      Open on KEGG <ExternalLink size={12} />
                    </a>
                  </>
                )}
              </p>
            )}
            <p className="panel-note">Nucleotide sequence is available on KEGG from the portal gene page.</p>
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
          This page mirrors the portal fields most useful for annotation lookup: multi-source product names, locus, operon,
          TMHMM, GenomegaMap omega plots, lineage pN/pS, and protein sequence. Representative demo panels (expression heatmaps,
          synthetic essentiality tables) have been removed.
        </Provenance>
      </div>
    </div>
  );
}
