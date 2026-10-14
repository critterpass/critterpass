/**
 * A destination's local guides over HTTP on real Postgres: listed guides only, the most reviewed
 * first, each with its published fields, its rating and platform page, its licence flag and the
 * reputation summary in the reader's language (English when the guide has none in it); a hidden
 * guide never shows, and a destination without guides answers an empty list.
 */
import type { DestinationGuidesWire } from '@cp/domain';
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerSharedContentRoutes } from '../../src/routes/shared-content';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from './command-doors-harness';

let harness: CommandDoorsHarness;
let english: SignedIn;
let vietnamese: SignedIn;
let bangkok: string;
let seoul: string;

const RATING = {
  value: 4.9,
  count: 812,
  platform: 'Tours by Locals',
  url: 'https://www.toursbylocals.com/somchai',
};

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => registerSharedContentRoutes(app, deps),
  );
  english = await harness.signInAnonymously();
  vietnamese = await harness.signInAnonymously();
  await withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ slug: string; id: string }>(
      `INSERT INTO destinations (slug, name, country, coverage) VALUES
         ('th-bangkok', 'Bangkok', 'Thailand', 'guest'), ('kr-seoul', 'Seoul', 'South Korea', 'guest')
       RETURNING slug, id`,
    );
    bangkok = rows.find((row) => row.slug === 'th-bangkok')?.id ?? '';
    seoul = rows.find((row) => row.slug === 'kr-seoul')?.id ?? '';
    await tx.query(
      `INSERT INTO local_guides (destination_id, name, kind, languages, specialties, areas, price,
                                 profile_url, review_summary, rating, licensed, sources, status)
       VALUES
         ($1, 'Somchai T.', 'individual', '{en,th}', '{food tours}', '{Chinatown}',
          '{"text": "from 2,500 THB for 4 hours", "source_url": "https://www.toursbylocals.com/somchai"}',
          'https://www.toursbylocals.com/somchai',
          '{"en": "Praised for food stops.", "vi": "Được khen vì các điểm ăn."}', $2, 'yes',
          '{https://www.toursbylocals.com/somchai}', 'listed'),
         ($1, 'Bangkok Walks', 'company', '{en}', '{history}', '{}', NULL,
          'https://bangkokwalks.example', '{"en": "Small groups, good pacing."}', NULL, 'unknown',
          '{https://bangkokwalks.example}', 'listed'),
         ($1, 'Asked to be hidden', 'individual', '{en}', '{}', '{}', NULL,
          'https://hidden.example', '{"en": "Hidden."}', NULL, 'unknown', '{}', 'hidden')`,
      [bangkok, JSON.stringify(RATING)],
    );
    await tx.query(
      `INSERT INTO user_settings (user_id, app_locale) VALUES ($1, 'vi')
       ON CONFLICT (user_id) DO UPDATE SET app_locale = 'vi'`,
      [vietnamese.uid],
    );
  });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function read(path: string, who: SignedIn) {
  const response = await harness.request(path, { headers: { cookie: who.cookie } });
  return {
    status: response.status,
    cache: response.headers.get('cache-control'),
    body: (await response.json()) as DestinationGuidesWire,
  };
}

describe('GET /v1/destinations/{id}/guides', () => {
  it('answers listed guides, the most reviewed first, with their published fields', async () => {
    const { status, cache, body } = await read(`/v1/destinations/${bangkok}/guides`, english);
    expect(status).toBe(200);
    expect(cache).toBe('private, max-age=300');
    expect(body.destination_id).toBe(bangkok);
    expect(body.guides).toEqual([
      {
        id: expect.any(String) as string,
        name: 'Somchai T.',
        kind: 'individual',
        languages: ['en', 'th'],
        specialties: ['food tours'],
        areas: ['Chinatown'],
        price: {
          text: 'from 2,500 THB for 4 hours',
          source_url: 'https://www.toursbylocals.com/somchai',
        },
        profile_url: 'https://www.toursbylocals.com/somchai',
        review_summary: 'Praised for food stops.',
        review_summary_locale: 'en',
        rating: RATING,
        licensed: 'yes',
      },
      expect.objectContaining({ name: 'Bangkok Walks', rating: null, price: null }),
    ]);
  });

  it('gives the summary in the reader’s language, else English, and finds a destination by slug', async () => {
    const { body } = await read('/v1/destinations/th-bangkok/guides', vietnamese);
    expect(body.guides.map((g) => [g.review_summary, g.review_summary_locale])).toEqual([
      ['Được khen vì các điểm ăn.', 'vi'],
      ['Small groups, good pacing.', 'en'],
    ]);
  });

  it('answers an empty list for a destination without guides, and 404 for an unknown one', async () => {
    expect((await read(`/v1/destinations/${seoul}/guides`, english)).body).toEqual({
      destination_id: seoul,
      guides: [],
    });
    const unknown = await harness.request('/v1/destinations/nowhere/guides', {
      headers: { cookie: english.cookie },
    });
    expect(unknown.status).toBe(404);
  });
});
