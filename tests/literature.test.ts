import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Gene } from '../src/lib/types';
import {
  doiUrlFor,
  geneQuery,
  literatureElsewhere,
  pmcUrlFor,
  pubmedUrlFor,
  termQuery,
  toPaper,
  geneLiterature,
} from '../src/lib/literature';

function g(over: Partial<Gene> & { orf: string }): Gene {
  return {
    gene: null,
    name: over.gene ?? over.orf,
    start: 1,
    end: 100,
    strand: '+',
    length: 30,
    bp: 100,
    annotation: 'x',
    category: 'information',
    uniprot: null,
    ...over,
  };
}

describe('literature query builders', () => {
  const dnaA = g({ orf: 'Rv0001', gene: 'dnaA', uniprot: 'P9WNW3' });

  it('scopes identifiers to title/abstract and includes the UniProt accession', () => {
    expect(geneQuery(dnaA)).toBe(
      '(TITLE_ABS:"Rv0001" OR TITLE_ABS:"dnaA" OR TITLE_ABS:"P9WNW3") AND (tuberculosis OR mycobacterium)',
    );
  });

  it('ANDs extra terms onto the gene query', () => {
    expect(geneQuery(dnaA, 'title-abstract', 'rifampin')).toBe(
      '(TITLE_ABS:"Rv0001" OR TITLE_ABS:"dnaA" OR TITLE_ABS:"P9WNW3") AND (tuberculosis OR mycobacterium) AND TITLE_ABS:"rifampin"',
    );
    expect(geneQuery(dnaA, 'full-text', 'rifampin essential')).toContain('"rifampin"');
    expect(geneQuery(dnaA, 'full-text', 'rifampin essential')).toContain('"essential"');
  });

  it('builds an organism-scoped term query when there is no gene', () => {
    expect(termQuery('essential')).toBe('TITLE_ABS:"essential" AND (tuberculosis OR mycobacterium)');
  });

  it('exposes PubMed, PMC and DOI deep-links from parsed metadata', () => {
    const paper = toPaper({
      id: '123',
      source: 'MED',
      pmid: '8733228',
      pmcid: 'PMC123',
      doi: '10.1111/example',
      title: 'A paper about dnaA.',
      authorString: 'Salazar L.',
      journalTitle: 'Mol. Microbiol.',
      pubYear: '1996',
      citedByCount: 12,
      isOpenAccess: 'Y',
    });
    expect(paper).toMatchObject({
      pmid: '8733228',
      pmcid: 'PMC123',
      doi: '10.1111/example',
      pubmedUrl: pubmedUrlFor('8733228'),
      pmcUrl: pmcUrlFor('PMC123'),
      doiUrl: doiUrlFor('10.1111/example'),
      url: doiUrlFor('10.1111/example'),
      authors: 'Salazar L.',
    });
    expect(paper?.europepmcUrl).toBe('https://europepmc.org/article/MED/123');
  });

  it('offers PubMed, PMC, UniProt, Mycobrowser and portal search chips', () => {
    const ids = literatureElsewhere(dnaA, 'rifampin').map((link) => link.id);
    expect(ids).toEqual(['pubmed', 'pmc', 'europepmc', 'uniprot', 'mycobrowser', 'tbportal']);
    expect(literatureElsewhere(dnaA, 'rifampin').find((l) => l.id === 'uniprot')?.href).toContain('P9WNW3');
  });
});

describe('geneLiterature merge', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps Europe PMC ranking and citation ids when UniProt adds overlapping refs', async () => {
    const epmc = {
      hitCount: 1,
      resultList: {
        result: [
          {
            id: '1',
            source: 'MED',
            pmid: '8733228',
            title: 'Organization of the origins of replication',
            citedByCount: 400,
            doi: '10.1111/j.1365-2958.1996.tb02617.x',
          },
        ],
      },
    };
    const uniprot = {
      references: [
        {
          citation: {
            title: 'Organization of the origins of replication',
            citationCrossReferences: [
              { database: 'PubMed', id: '8733228' },
              { database: 'DOI', id: '10.1111/j.1365-2958.1996.tb02617.x' },
            ],
            authors: ['Salazar L.'],
            journal: 'Mol. Microbiol.',
            publicationDate: '1996',
          },
        },
        {
          citation: {
            title: 'A UniProt-only nucleotide sequence submission',
            citationCrossReferences: [{ database: 'PubMed', id: '99999999' }],
            publicationDate: '1995',
          },
        },
      ],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('europepmc')) {
        return { ok: true, json: async () => epmc } as Response;
      }
      if (url.includes('uniprot.org')) {
        return { ok: true, json: async () => uniprot } as Response;
      }
      throw new Error(url);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await geneLiterature(g({ orf: 'Rv0001', gene: 'dnaA', uniprot: 'P9WNW3' }), { limit: 5, sort: 'cited' });
    expect(result.papers[0]?.pmid).toBe('8733228');
    expect(result.papers[0]?.citedBy).toBe(400);
    expect(result.papers[0]?.origins).toEqual(['europepmc', 'uniprot']);
    expect(result.papers.some((p) => p.pmid === '99999999')).toBe(true);
    expect(result.backends).toEqual(['europepmc', 'uniprot']);
  });
});
