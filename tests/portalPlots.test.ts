import { describe, expect, it } from 'vitest';
import {
  portalGenePage,
  portalOmegaPlotUrl,
  portalTmhmmUrl,
  portalVariantsUrl,
} from '../src/lib/portalPlots';

describe('portal plot deep-links', () => {
  it('points at the published TMHMM GIF on the portal gene page', () => {
    expect(portalTmhmmUrl('Rv0009')).toBe('https://orca2.tamu.edu/U19/pages/images/Rv0009.gif');
  });

  it('points at the GenomegaMap omega PNG and variants text', () => {
    expect(portalOmegaPlotUrl('Rv0009')).toBe(
      'https://orca1.tamu.edu/selection/mtb_genomes.10k/output/Rv0009.omega_plot.png',
    );
    expect(portalVariantsUrl('Rv0009')).toBe(
      'https://orca1.tamu.edu/selection/mtb_genomes.10k/output/Rv0009.variants.txt',
    );
  });

  it('encodes ORF ids in path segments', () => {
    expect(portalGenePage('Rv/0009')).toContain('Rv%2F0009.html');
    expect(portalTmhmmUrl('Rv 9')).toContain('Rv%209.gif');
  });
});
