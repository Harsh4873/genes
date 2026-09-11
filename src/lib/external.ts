import { portalGenePage } from './portalPlots';

// Real, resolvable links to public databases, keyed by ORF id. These point at
// live third-party resources for the actual H37Rv gene.

/** Fields needed to build outbound database URLs. */
export interface ExternalTarget {
  orf: string;
  gene?: string | null;
  uniprot?: string | null;
}

export interface ExternalLink {
  id: string;
  label: string;
  desc: string;
  href: (target: ExternalTarget) => string;
  /** Extra line when the URL is a fallback rather than the preferred record. */
  note?: (target: ExternalTarget) => string | undefined;
}

const UNIPROT_ACCESSION_RE =
  /^([OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})$/;

export function normalizeUniprot(value: string | null | undefined): string | null {
  const accession = value?.trim().toUpperCase() ?? '';
  return UNIPROT_ACCESSION_RE.test(accession) ? accession : null;
}

/** AlphaFold DB v6 entry page for a UniProt accession (model F1). */
export function alphafoldEntryUrl(uniprotAccession: string): string {
  const accession = normalizeUniprot(uniprotAccession);
  if (!accession) throw new Error('alphafoldEntryUrl requires a UniProt accession');
  return `https://alphafold.ebi.ac.uk/entry/AF-${accession}-F1`;
}

export function uniprotRecordUrl(uniprotAccession: string): string {
  const accession = normalizeUniprot(uniprotAccession);
  if (!accession) throw new Error('uniprotRecordUrl requires a UniProt accession');
  return `https://www.uniprot.org/uniprotkb/${accession}`;
}

export function alphafoldHref(target: ExternalTarget): string {
  const accession = normalizeUniprot(target.uniprot);
  // Never emit the ORF text-search URL — AlphaFold does not index H37Rv locus tags.
  return accession ? alphafoldEntryUrl(accession) : portalGenePage(target.orf);
}

export function uniprotHref(target: ExternalTarget): string {
  const accession = normalizeUniprot(target.uniprot);
  if (accession) return uniprotRecordUrl(accession);
  return `https://www.uniprot.org/uniprotkb?query=${encodeURIComponent(`${target.orf} AND organism_id:83332`)}`;
}

export const EXTERNAL_LINKS: ExternalLink[] = [
  {
    id: 'mycobrowser',
    label: 'Mycobrowser',
    desc: 'Curated H37Rv annotation (EPFL)',
    href: (target) => `https://mycobrowser.epfl.ch/genes/${encodeURIComponent(target.orf)}`,
  },
  {
    id: 'tbportal',
    label: 'TB Genome Portal',
    desc: 'Original U19 annotation portal',
    href: (target) => portalGenePage(target.orf),
  },
  {
    id: 'kegg',
    label: 'KEGG',
    desc: 'Pathways & orthology (mtu)',
    href: (target) => `https://www.genome.jp/dbget-bin/www_bget?mtu:${encodeURIComponent(target.orf)}`,
  },
  {
    id: 'uniprot',
    label: 'UniProt',
    desc: 'Protein sequence & features',
    href: uniprotHref,
    note: (target) => (normalizeUniprot(target.uniprot) ? undefined : 'Search (no accession in the catalog)'),
  },
  {
    id: 'string',
    label: 'STRING',
    desc: 'Protein interaction network',
    href: (target) => {
      const accession = normalizeUniprot(target.uniprot);
      const id = accession ?? target.orf;
      return `https://string-db.org/cgi/network?identifiers=${encodeURIComponent(id)}&species=83332`;
    },
  },
  {
    id: 'alphafold',
    label: 'AlphaFold DB',
    desc: 'Predicted 3D structure',
    href: alphafoldHref,
    note: (target) =>
      normalizeUniprot(target.uniprot)
        ? undefined
        : 'Opens the TB Genome Portal gene page (no UniProt accession to build an AlphaFold entry URL)',
  },
  {
    id: 'ncbi',
    label: 'NCBI Gene',
    desc: 'Reference record & literature',
    href: (target) =>
      `https://www.ncbi.nlm.nih.gov/gene/?term=${encodeURIComponent(`${target.orf} Mycobacterium tuberculosis`)}`,
  },
];
