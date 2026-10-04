/**
 * Street-level photos in a place batch, on recorded Mapillary answers and model verdicts: a place
 * with nothing else gets the first photo the check keeps, saved at proposal time, as a credited
 * and attributed media item, and the review page shows its distance, year and the check's reason.
 */
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createGateway } from '@cp/ai';
import { poiRefSubject } from '@cp/content';
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';

import { mediaKind } from '../src/kinds/media';
import { sourceAllowedFor } from '../src/kinds/media/places';
import { passRate, renderPlacePages } from '../src/kinds/media/review-page';
import { streetPhotos } from '../src/kinds/media/street-batch';
import { runValidators } from '../src/validators/registry';
import { replayFetch } from './fixture-fetch';
import { BLESSED_SACRAMENT, STREET_NOW } from './media-street-fixture';

const recorded = {
  fetch: () => Promise.reject(new Error('the recorded answers cover every request')),
  cacheDir: path.join(import.meta.dirname, 'fixtures', 'media-street'),
  now: () => STREET_NOW,
};

describe('street photos in a batch', { timeout: 60_000 }, () => {
  it('gives a place the first photo the check keeps, credited and attributed', async () => {
    const filesDir = mkdtempSync(path.join(os.tmpdir(), 'street-files-'));
    const downloads: string[] = [];
    const replay = replayFetch(['deepseek-photo-check-other-name', 'deepseek-photo-check-keep']);
    const batch = await streetPhotos(
      {
        http: {
          ...recorded,
          fetch: ((input: string) => {
            downloads.push(input);
            return Promise.resolve(
              new Response(createCanvas(1024, 768).toBuffer('image/jpeg'), { status: 200 }),
            );
          }) as unknown as typeof fetch,
        },
        token: 'token-under-test',
        check: {
          gateway: createGateway({ apiKey: 'test-key', fetch: replay.fetch, maxAttempts: 1 }),
          cacheDir: mkdtempSync(path.join(os.tmpdir(), 'street-checks-')),
        },
        filesDir,
        maxChecks: 10,
      },
      [BLESSED_SACRAMENT],
    );
    expect(batch.tallies).toEqual({
      lisbon: { places: 1, covered: 1, fitting: 1, checked: 2, kept: 1 },
    });
    expect(batch.items).toHaveLength(1);
    const [item] = batch.items;
    expect(item).toMatchObject({
      id: 'mapillary-photo-1018975135577358',
      source: 'mapillary',
      source_url: 'https://www.mapillary.com/app/?pKey=1018975135577358',
      subjects: [poiRefSubject(BLESSED_SACRAMENT.ref)],
      licence: 'cc-by-sa-4.0',
      attribution_required: true,
    });
    expect(item?.credit).toMatch(/^.+ · CC BY-SA 4\.0 · Mapillary$/u);
    expect(item?.title).toMatch(
      /^Church of the Blessed Sacrament · street view, \d+ m away, \d{4}: /u,
    );
    expect(batch.picks.get(BLESSED_SACRAMENT.ref)).toMatchObject({ reason: expect.any(String) });
    // Both looked-at images were saved at proposal time: their links expire.
    expect(downloads).toHaveLength(2);
    expect(existsSync(path.join(filesDir, 'mapillary-photo-1018975135577358.jpg'))).toBe(true);
    // A photo of the place itself passes the release's rules; on a destination it does not.
    expect(sourceAllowedFor('mapillary', poiRefSubject(BLESSED_SACRAMENT.ref), null)).toBe(true);
    const onDestination = runValidators(
      'media',
      [{ ...item!, subjects: ['destination:lisbon'] }],
      mediaKind.validators,
    );
    expect(onDestination.severity).toBe('fail');
  });

  it('stops at the limit of checks, and counts the places it left', async () => {
    const batch = await streetPhotos(
      {
        http: recorded,
        token: 'token-under-test',
        check: {
          gateway: createGateway({
            apiKey: 'test-key',
            fetch: replayFetch([]).fetch,
            maxAttempts: 1,
          }),
          cacheDir: mkdtempSync(path.join(os.tmpdir(), 'street-checks-')),
        },
        filesDir: mkdtempSync(path.join(os.tmpdir(), 'street-files-')),
        maxChecks: 0,
      },
      [BLESSED_SACRAMENT],
    );
    expect(batch).toMatchObject({ items: [], skipped: 1 });
  });

  it('shows a kept street photo on the page with its distance, year and reason', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'street-pages-'));
    const tally = { places: 195, covered: 150, fitting: 90, checked: 200, kept: 12 };
    expect(passRate(tally)).toContain('kept a photo for 12 places (6%)');
    await renderPlacePages(
      [
        {
          id: 'mapillary-photo-1018975135577358',
          kind: 'photo',
          source: 'mapillary',
          source_id: '1018975135577358',
          source_url: 'https://www.mapillary.com/app/?pKey=1018975135577358',
          download_url: 'https://scontent.example/a.jpg',
          preview_url: 'https://scontent.example/a.jpg',
          subjects: [poiRefSubject(BLESSED_SACRAMENT.ref)],
          rank: 0,
          title: 'Church of the Blessed Sacrament · street view',
          author: 'someone',
          author_url: null,
          licence: 'cc-by-sa-4.0',
          licence_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
          attribution_required: true,
          credit: 'someone · CC BY-SA 4.0 · Mapillary',
          width: 2048,
          height: 1536,
          duration_ms: null,
        },
      ],
      {
        proposals: [
          {
            place: BLESSED_SACRAMENT,
            outcome: 'street',
            match: null,
            street: { distanceM: 26, year: 2021, reason: 'Large church facade fills frame.' },
          },
        ],
        unanswered: [],
        street: { lisbon: tally },
      },
      new Map(),
      dir,
      '2026-10-04-media-02',
    );
    const html = readFileSync(path.join(dir, 'places-lisbon.html'), 'utf8');
    const section = html.slice(html.indexOf('<h2>Street view'), html.indexOf('<h2>No photo'));
    expect(section).toContain('Church of the Blessed Sacrament');
    expect(section).toContain('26 m from the place');
    expect(section).toContain('taken 2021');
    expect(section).toContain('Large church facade fills frame.');
    expect(section).toContain('someone · CC BY-SA 4.0 · Mapillary');
    expect(section).toContain('kept a photo for 12 places (6%)');
    const own = html.slice(html.indexOf('<h2>The place itself'), html.indexOf('<h2>Generic'));
    expect(own).not.toContain('Blessed Sacrament');
  });
});
