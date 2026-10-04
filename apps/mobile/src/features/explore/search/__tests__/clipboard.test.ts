/**
 * The clipboard card offers a copied post or map link Add from a link can read, once: a link
 * imported on this phone is not offered again, even copied with different tracking parameters.
 */
import { describe, expect, it } from '@jest/globals';

import { classifyLink, clipboardOffer, markImported } from '../clipboard';

describe('clipboard links', () => {
  it('names the platform of a post or map link inside copied text', () => {
    const cases: [string, string | null][] = [
      ['look https://www.tiktok.com/@balibites/video/7419000000000000000?lang=en', 'tiktok'],
      ['https://vt.tiktok.com/ZSabc123/', 'tiktok'],
      ['https://youtu.be/dQw4w9WgXcQ', 'youtube'],
      ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
      ['https://www.instagram.com/p/C1abc/', 'instagram'],
      ['https://www.google.com/maps/place/Tukad+Cepung/@-8.43,115.38,17z', 'google_maps'],
      ['https://maps.app.goo.gl/AbCdEf', 'google_maps'],
      ['https://maps.apple.com/?q=Tibumana&ll=-8.5,115.3', 'apple_maps'],
      ['https://www.google.com/search?q=bali', null],
      ['https://example.com/blog/bali', null],
      ['no link here', null],
    ];
    expect(cases.map(([text]) => classifyLink(text)?.platform ?? null)).toEqual(
      cases.map(([, platform]) => platform),
    );
  });

  it('shows the link short, without its scheme', () => {
    expect(
      classifyLink('https://www.tiktok.com/@balibites/video/7419000000000000000')?.display,
    ).toBe('tiktok.com/@balibites/video/74190…');
  });

  it('hides a link already imported on this phone', () => {
    const copied = 'https://www.tiktok.com/@balibites/video/7419111111111111111?is_from_webapp=1';
    expect(clipboardOffer(copied)?.platform).toBe('tiktok');
    markImported('https://www.tiktok.com/@balibites/video/7419111111111111111/');
    expect(clipboardOffer(copied)).toBeNull();
    expect(clipboardOffer('https://youtu.be/dQw4w9WgXcQ')?.platform).toBe('youtube');
  });
});
