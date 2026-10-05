import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { pageWindow } from '../../../src/places/profile/pages';
import { resizePhoto } from '../../../src/places/profile/photos';
import { skipReason } from '../../../src/places/profile/run';
import { enginesFor, isExcludedUrl } from '../../../src/places/profile/search';
import type { ProfileTarget } from '../../../src/places/profile/store';

const target: ProfileTarget = {
  id: '01a1053c-2fd3-7324-a7de-8d86acacbcac',
  name: 'Bảo Đại Summer Palace (Dinh III)',
  nameLocal: 'Dinh Bảo Đại III',
  category: 'museum',
  tags: [],
  sources: ['osm'],
  website: null,
  address: null,
  town: 'Đà Lạt',
  country: 'VN',
  reviewed: false,
  status: null,
};

describe('place profile skip rules', () => {
  it('runs a place with no profile while the day has budget left', () => {
    expect(skipReason(target, false, 0, 5_000_000)).toBeNull();
  });

  it('never writes over a reviewed note, a pin-only kind or a missing place', () => {
    expect(skipReason({ ...target, reviewed: true }, true, 0, 5_000_000)).toBe('reviewed');
    expect(skipReason({ ...target, category: 'transit' }, false, 0, 5_000_000)).toBe('kind');
    expect(skipReason({ ...target, category: 'health' }, false, 0, 5_000_000)).toBe('kind');
    expect(skipReason(null, false, 0, 5_000_000)).toBe('missing');
  });

  it('leaves a ready or declined profile alone unless forced; a failed one runs again', () => {
    expect(skipReason({ ...target, status: 'ready' }, false, 0, 5_000_000)).toBe('exists');
    expect(skipReason({ ...target, status: 'declined' }, false, 0, 5_000_000)).toBe('exists');
    expect(skipReason({ ...target, status: 'ready' }, true, 0, 5_000_000)).toBeNull();
    expect(skipReason({ ...target, status: 'failed' }, false, 0, 5_000_000)).toBeNull();
  });

  it('stops new runs once the daily cap is spent', () => {
    expect(skipReason(target, false, 5_000_000, 5_000_000)).toBe('daily_cap');
    expect(skipReason(target, true, 4_999_999, 5_000_000)).toBeNull();
  });
});

describe('place search pacing and screening', () => {
  it('rotates two engines a query around the enabled list', () => {
    const engines = ['bing', 'mojeek', 'startpage', 'qwant', 'duckduckgo'];
    const used = [0, 1, 2, 3, 4].map((seq) => enginesFor(seq, engines));
    expect(used[0]).toEqual(['bing', 'mojeek']);
    expect(used[1]).toEqual(['startpage', 'qwant']);
    expect(used[2]).toEqual(['duckduckgo', 'bing']);
    // Every engine is used, none in every query.
    for (const engine of engines) {
      const count = used.filter((pair) => pair.includes(engine)).length;
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(used.length);
    }
    expect(enginesFor(7, ['bing'])).toEqual(['bing']);
  });

  it('leaves out suppliers, Foursquare, social and pin boards', () => {
    for (const url of [
      'https://www.tripadvisor.com/Attraction_Review-g293922',
      'https://www.booking.com/attractions/x',
      'https://foursquare.com/v/abc',
      'https://fastly.4sqi.net/img/general/x.jpg',
      'https://m.facebook.com/dinh3',
      'https://i.pinimg.com/736x/aa.jpg',
      'not a url',
    ]) {
      expect(isExcludedUrl(url), url).toBe(true);
    }
    expect(isExcludedUrl('https://agotourist.com/dinh-bao-dai-da-lat-dinh-iii/')).toBe(false);
  });
});

describe('page text and photos', () => {
  it("starts a page's window shortly before its first mention of the place, accents folded", () => {
    const text = `${'x '.repeat(2_000)}Giá vé Dinh Bao Dai III: 60.000 đ ${'y '.repeat(10)}`;
    const window = pageWindow(text, ['Dinh Bảo Đại III']);
    expect(window).toContain('Dinh Bao Dai III: 60.000');
    expect(window.length).toBeLessThan(800);
  });

  it('resizes a photo to 480 px wide and refuses a thumbnail', async () => {
    const big = await sharp({
      create: { width: 1600, height: 1200, channels: 3, background: '#2a6' },
    })
      .png()
      .toBuffer();
    const small = await sharp({
      create: { width: 120, height: 90, channels: 3, background: '#2a6' },
    })
      .png()
      .toBuffer();
    expect(await resizePhoto(big)).toMatchObject({ width: 480, height: 360 });
    expect(await resizePhoto(small)).toBeNull();
  });
});
