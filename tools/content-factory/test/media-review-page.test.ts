/**
 * The review page of a destination: every proposed photo with its place, kind, licence and credit,
 * the matches to look at twice, the live photos suggested to drop, and the live photos the batch
 * removes or gives other places.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildRelease, poiRefSubject, type ContentItem } from '@cp/content';
import { describe, expect, it } from 'vitest';

import { GENERIC_TITLE } from '../src/kinds/media/generic';
import { suggestedDrops, type PlaceProposal } from '../src/kinds/media/place-batch';
import type { MediaPlace } from '../src/kinds/media/places';
import { needsALook, renderPlacePages } from '../src/kinds/media/review-page';

const place = (name: string, category: string, lat: number, lng: number, ref = 'fsq_os:a1') => ({
  ref,
  destination: 'kyoto',
  name,
  category,
  lat,
  lng,
});

describe('the review page of a destination', () => {
  const photo = (id: string, subjects: string[], title: string): ContentItem<'media'> => ({
    id: `wikimedia-photo-${id}`,
    kind: 'photo',
    source: 'wikimedia',
    source_id: id,
    source_url: 'https://commons.wikimedia.org/wiki/File:A.jpg',
    download_url: 'https://upload.wikimedia.org/a.jpg',
    preview_url: 'https://upload.wikimedia.org/a.jpg',
    subjects,
    rank: 0,
    title,
    author: 'A. Author',
    author_url: null,
    licence: 'cc-by-sa-4.0',
    licence_url: 'https://creativecommons.org/licenses/by-sa/4.0',
    attribution_required: true,
    credit: 'A. Author · CC BY-SA 4.0 · Wikimedia Commons',
    width: 1920,
    height: 1280,
    duration_ms: null,
  });
  const temple: MediaPlace = place('高台寺', 'temple_shrine', 35, 135.78, 'fsq_os:a1');
  const cafe: MediaPlace = place('Kaikado Cafe', 'food', 35, 135.77, 'fsq_os:b2');
  const bar: MediaPlace = place('Trench', 'nightlife', 35, 135.76, 'fsq_os:c3');
  const proposals: PlaceProposal[] = [
    { place: temple, outcome: 'own', match: { label: '高台寺', score: 1, distanceM: 1200 } },
    { place: cafe, outcome: 'generic', match: null },
    { place: bar, outcome: 'none', match: null },
  ];

  it('marks a far or loosely named match to look at twice', () => {
    const [far, generic] = proposals;
    expect(far !== undefined && needsALook(far)).toBe(true);
    expect(generic !== undefined && needsALook(generic)).toBe(false);
    expect(
      needsALook({
        place: temple,
        outcome: 'own',
        match: { label: 'x', score: 0.67, distanceM: 5 },
      }),
    ).toBe(true);
    expect(
      needsALook({ place: temple, outcome: 'own', match: { label: 'x', score: 1, distanceM: 5 } }),
    ).toBe(false);
  });

  it('lists every proposed photo with its place, kind, licence and credit', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'media-pages-'));
    const items = [
      photo('1', [poiRefSubject(temple.ref)], 'x'),
      {
        ...photo('2', [poiRefSubject(cafe.ref)], `${GENERIC_TITLE}cup of coffee`),
        credit: 'Photo: B · Pexels',
      },
      photo('3', ['destination:kyoto'], 'Kyoto'),
    ];
    const files = await renderPlacePages(
      items,
      { proposals, unanswered: ['pixabay: tacos'] },
      new Map(),
      dir,
      '2026-10-04-media-01',
    );
    expect(files).toEqual(['places-kyoto.html']);
    const html = readFileSync(path.join(dir, 'places-kyoto.html'), 'utf8');
    const own = html.slice(html.indexOf('<h2>The place itself'), html.indexOf('<h2>Generic'));
    const generic = html.slice(html.indexOf('<h2>Generic'), html.indexOf('<h2>No photo'));
    expect(own).toContain('高台寺');
    expect(own).toContain('A. Author · CC BY-SA 4.0 · Wikimedia Commons');
    expect(own).toContain('cc-by-sa-4.0');
    expect(own).toContain('Look twice');
    expect(own).not.toContain('Kaikado');
    expect(generic).toContain('Kaikado Cafe');
    expect(generic).toContain('cup of coffee');
    expect(generic).toContain('Photo: B · Pexels');
    expect(html.slice(html.indexOf('<h2>No photo'))).toContain('Trench');
    expect(html).not.toContain('wikimedia-photo-3');
    expect(html).toContain('pixabay: tacos');
    expect(html).not.toContain('suggested to drop');
    expect(html).toContain('0 live photos removed');
  });

  it('lists the live photos the batch removes and changes, with the places and the reason', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'media-pages-'));
    const gone = {
      ...photo('7', [], `${GENERIC_TITLE}bar counter drinks`),
      credit: 'Photo: G · Pexels',
    };
    const moved = photo('8', ['destination:kyoto'], 'Kyoto');
    await renderPlacePages(
      [gone, moved],
      {
        proposals,
        unanswered: [],
        removed: [
          { id: gone.id, reason: 'turned down (brand)', was: [poiRefSubject(bar.ref)], now: [] },
          { id: 'pexels-photo-1', reason: 'x', was: ['poi:fsq-os-ffff'], now: [] },
        ],
        changed: [
          {
            id: moved.id,
            reason: 'shows other places than before',
            was: ['destination:kyoto', poiRefSubject(cafe.ref)],
            now: ['destination:kyoto'],
          },
        ],
      },
      new Map(),
      dir,
      '2026-10-05-media-01',
    );
    const html = readFileSync(path.join(dir, 'places-kyoto.html'), 'utf8');
    // The second removal concerns a place of another destination: it is on that page, not here.
    const removed = html.slice(
      html.indexOf('<h2>1 live photos removed'),
      html.indexOf('live photos changed'),
    );
    expect(removed).toContain('No longer for: Trench');
    expect(removed).toContain('turned down (brand)');
    expect(removed).toContain('Photo: G · Pexels');
    expect(removed).not.toContain('pexels-photo-1<');
    const changed = html.slice(html.indexOf('<h2>1 live photos changed'));
    expect(changed).toContain('No longer for: Kaikado Cafe');
  });

  it('leads with the live photos suggested to drop, where they are shown today', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'media-pages-'));
    const generic = {
      ...photo('2', [poiRefSubject(cafe.ref)], `${GENERIC_TITLE}cup of coffee`),
      id: 'pixabay-photo-5116219',
      source: 'pixabay' as const,
      source_id: '5116219',
    };
    const live = buildRelease({
      kind: 'media',
      version: 4,
      items: [generic, photo('3', ['destination:kyoto'], 'Kyoto')],
      generated_by: {
        batch_key: 'live',
        route: null,
        model: null,
        generated_at: '2026-10-03T00:00:00Z',
      },
      approved_by: null,
    });
    const drops = suggestedDrops(live, [temple, cafe, bar]);
    expect(drops).toEqual([
      { id: 'pixabay-photo-5116219', reason: 'off-subject', destinations: ['kyoto'] },
    ]);
    await renderPlacePages(
      [generic],
      { proposals, unanswered: [], suggestedDrops: drops },
      new Map(),
      dir,
      '2026-10-04-media-01',
    );
    const html = readFileSync(path.join(dir, 'places-kyoto.html'), 'utf8');
    const first = html.slice(html.indexOf('<h2>Live today'), html.indexOf('<h2>The place itself'));
    expect(first).toContain('pixabay-photo-5116219');
    expect(first).toContain('Suggested to drop: off-subject');
    expect(first).toContain('Kaikado Cafe');
  });
});
