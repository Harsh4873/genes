import { describe, expect, it } from 'vitest';
import { validateDataset } from '../src/lib/dataset';
import {
  EXTERNAL_LINKS,
  alphafoldEntryUrl,
  alphafoldHref,
  uniprotHref,
  uniprotRecordUrl,
} from '../src/lib/external';
import { portalGenePage } from '../src/lib/portalPlots';
import publishedDataset from '../public/data/genes.json';

function link(id: string) {
  const match = EXTERNAL_LINKS.find((candidate) => candidate.id === id);
  if (!match) throw new Error(`Missing external link: ${id}`);
  return match;
}

const dnaA = {
  orf: 'Rv0001',
  gene: 'dnaA',
  uniprot: 'P9WNW3',
};

const katG = {
  orf: 'Rv1908c',
  gene: 'katG',
  uniprot: 'P9WIE5',
};

describe('external link contracts', () => {
  it('keeps link ids unique', () => {
    const ids = EXTERNAL_LINKS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses the TB Genome Portal per-record page', () => {
    expect(link('tbportal').href({ orf: 'Rv1908c' })).toBe(
      'https://orca2.tamu.edu/U19/pages/Rv1908c.html',
    );
  });

  it('encodes a TB Genome Portal record id as one path segment', () => {
    expect(link('tbportal').href({ orf: 'Rv/1908 c?' })).toBe(
      'https://orca2.tamu.edu/U19/pages/Rv%2F1908%20c%3F.html',
    );
  });

  it('opens AlphaFold v6 model entries from UniProt accessions', () => {
    expect(alphafoldEntryUrl('P9WNW3')).toBe('https://alphafold.ebi.ac.uk/entry/AF-P9WNW3-F1');
    expect(link('alphafold').href(dnaA)).toBe('https://alphafold.ebi.ac.uk/entry/AF-P9WNW3-F1');
    expect(link('alphafold').href(katG)).toBe('https://alphafold.ebi.ac.uk/entry/AF-P9WIE5-F1');
    expect(alphafoldHref(dnaA)).not.toContain('/search/text/');
    expect(alphafoldHref(katG)).not.toContain('/search/text/');
  });

  it('falls back to the portal gene page when AlphaFold has no accession', () => {
    expect(alphafoldHref({ orf: 'Rv0001' })).toBe(portalGenePage('Rv0001'));
    expect(alphafoldHref({ orf: 'Rv0001', uniprot: 'not-an-accession' })).toBe(portalGenePage('Rv0001'));
    expect(link('alphafold').note?.({ orf: 'Rv0001' })).toMatch(/TB Genome Portal/);
  });

  it('opens UniProt protein records from accessions', () => {
    expect(uniprotRecordUrl('P9WNW3')).toBe('https://www.uniprot.org/uniprotkb/P9WNW3');
    expect(uniprotHref(dnaA)).toBe('https://www.uniprot.org/uniprotkb/P9WNW3');
    expect(uniprotHref(katG)).toBe('https://www.uniprot.org/uniprotkb/P9WIE5');
    expect(link('uniprot').href(dnaA)).toBe('https://www.uniprot.org/uniprotkb/P9WNW3');
  });

  it('keeps a UniProt organism search only when the accession is missing', () => {
    expect(uniprotHref({ orf: 'Rv0001' })).toContain('query=Rv0001');
    expect(uniprotHref({ orf: 'Rv0001' })).toMatch(/organism_id(:|%3A)83332/);
  });

  it('uses the UniProt accession for STRING when present', () => {
    expect(link('string').href(dnaA)).toBe(
      'https://string-db.org/cgi/network?identifiers=P9WNW3&species=83332',
    );
    expect(link('string').href({ orf: 'Rv0001' })).toContain('identifiers=Rv0001');
  });

  it('matches the published catalog for Rv0001 / katG', () => {
    const dataset = validateDataset(publishedDataset);
    const liveDnaA = dataset.byOrf.get('Rv0001');
    const liveKatG = dataset.byOrf.get('Rv1908c');
    expect(liveDnaA?.uniprot).toBe('P9WNW3');
    expect(liveKatG?.uniprot).toBe('P9WIE5');
    expect(link('alphafold').href(liveDnaA!)).toBe('https://alphafold.ebi.ac.uk/entry/AF-P9WNW3-F1');
    expect(link('alphafold').href(liveKatG!)).toBe('https://alphafold.ebi.ac.uk/entry/AF-P9WIE5-F1');
    expect(link('uniprot').href(liveDnaA!)).toBe('https://www.uniprot.org/uniprotkb/P9WNW3');
    expect(link('uniprot').href(liveKatG!)).toBe('https://www.uniprot.org/uniprotkb/P9WIE5');
  });
});
