/**
 * The media kind on recorded Pexels, Pixabay and Wikimedia Commons responses (the source cache
 * format, replayed from test/fixtures/media): candidates carry their licence and credit, only
 * reusable Commons licences pass, and the `lead` option ranks picks first.
 */
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { mediaCandidates, mediaKind } from '../src/kinds/media';
import type { SourceHttp } from '../src/kinds/media/http';
import { commonsLicence } from '../src/kinds/media/wikimedia';
import type { MediaSubject } from '../src/kinds/media/subjects';
import { runValidators } from '../src/validators/registry';

const RECORDED_AT = Date.parse('2026-10-01T02:00:00Z');

const http: SourceHttp = {
  fetch: () => Promise.reject(new Error('the recorded responses cover every request')),
  cacheDir: path.join(import.meta.dirname, 'fixtures', 'media'),
  now: () => RECORDED_AT,
};

const subject: MediaSubject = {
  key: 'destination:da-nang',
  photos: ['Da Nang Dragon Bridge'],
  videos: ['Da Nang'],
  landmarks: ['Marble Mountains Da Nang'],
};

const deps = { http, pexelsKey: 'recorded', pixabayKey: 'recorded' };

describe('media candidates', { timeout: 60_000 }, () => {
  it('searches every source and credits each result', async () => {
    const items = await mediaCandidates([subject], deps);
    const sources = new Set(items.map((i) => `${i.source}/${i.kind}`));
    expect(sources).toEqual(
      new Set([
        'pexels/photo',
        'pixabay/photo',
        'wikimedia/photo',
        'pexels/video',
        'pixabay/video',
      ]),
    );
    for (const item of items) {
      expect(item.subjects).toEqual(['destination:da-nang']);
      expect(item.download_url).toMatch(/^https:\/\//u);
      expect(item.credit.length).toBeGreaterThan(3);
    }
    expect(items.map((i) => i.rank)).toEqual(items.map((_, index) => index));
  });

  it('marks Commons files that need attribution and keeps free ones unmarked', async () => {
    const items = await mediaCandidates([subject], deps);
    const commons = items.filter((i) => i.source === 'wikimedia');
    expect(commons.length).toBeGreaterThan(0);
    for (const item of commons) {
      const free = item.licence === 'public-domain' || item.licence === 'cc0';
      expect(item.attribution_required).toBe(!free);
      expect(item.credit).toMatch(/Wikimedia Commons$/u);
    }
    for (const item of items.filter((i) => i.source !== 'wikimedia')) {
      expect(item.attribution_required).toBe(false);
    }
  });

  it('gives videos a duration and a thumbnail to review', async () => {
    const videos = (await mediaCandidates([subject], deps)).filter((i) => i.kind === 'video');
    expect(videos.length).toBeGreaterThan(0);
    for (const video of videos) {
      expect(video.duration_ms).toBeGreaterThanOrEqual(5000);
      expect(video.width).toBeGreaterThanOrEqual(1280);
    }
  });

  it('ranks the lead picks first', async () => {
    const all = await mediaCandidates([subject], deps);
    const pick = all.at(-1)!.id;
    const led = await mediaCandidates([subject], deps, [pick]);
    expect(led.find((i) => i.id === pick)?.rank).toBe(0);
  });

  it('passes validation as a batch', async () => {
    const items = await mediaCandidates([subject], deps);
    const report = runValidators('media', items, mediaKind.validators);
    expect(report.counts.fail).toBe(0);
  });
});

describe('Commons licences', () => {
  it('reuses public domain, CC0, CC BY and CC BY-SA only', () => {
    expect(commonsLicence('Public domain')).toBe('public-domain');
    expect(commonsLicence('CC0')).toBe('cc0');
    expect(commonsLicence('CC BY 4.0')).toBe('cc-by-4.0');
    expect(commonsLicence('CC BY-SA 3.0')).toBe('cc-by-sa-3.0');
    expect(commonsLicence('CC BY-NC 2.0')).toBeNull();
    expect(commonsLicence('GFDL')).toBeNull();
  });
});
