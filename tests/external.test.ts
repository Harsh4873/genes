import { describe, expect, it } from 'vitest';
import { EXTERNAL_LINKS } from '../src/lib/external';

function link(id: string) {
  const match = EXTERNAL_LINKS.find((candidate) => candidate.id === id);
  if (!match) throw new Error(`Missing external link: ${id}`);
  return match;
}

describe('external link contracts', () => {
  it('keeps link ids unique', () => {
    const ids = EXTERNAL_LINKS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses the TB Genome Portal per-record page', () => {
    expect(link('tbportal').href('Rv1908c', null)).toBe(
      'https://orca2.tamu.edu/U19/pages/Rv1908c.html',
    );
  });

  it('encodes a TB Genome Portal record id as one path segment', () => {
    expect(link('tbportal').href('Rv/1908 c?', null)).toBe(
      'https://orca2.tamu.edu/U19/pages/Rv%2F1908%20c%3F.html',
    );
  });
});
