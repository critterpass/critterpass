/**
 * The pre-draft closure check on recorded Tavily searches and a recorded DeepSeek extraction for a
 * Hanoi trip over Tet: the cited closure reaches the planner, which keeps the closed market out of
 * every day it could go on and rejects it on a closed date, while no page text, source or reason
 * ever reaches the drafting prompt.
 */
import { readFileSync } from 'node:fs';

import { buildSkeletonRequest, createGateway, createTavilySearch } from '@cp/ai';
import { validateItinerary, type DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { webClosureCheck } from '../../../../src/jobs/ai/draft/closures';
import type { DraftTripData } from '../../../../src/jobs/ai/draft/load';
import { buildPlanInput } from '../../../../src/jobs/ai/draft/plan-input';

interface Recorded {
  readonly tavily: { status: number; body: unknown }[];
  readonly deepseek: { status: number; body: unknown }[];
}

const RECORDED = JSON.parse(
  readFileSync(new URL('../../../fixtures/draft/tet-closures.json', import.meta.url), 'utf8'),
) as Recorded;

function queue(responses: readonly { status: number; body: unknown }[]): typeof fetch {
  const left = [...responses];
  return () => {
    const next = left.shift();
    if (next === undefined) throw new Error('no recorded response left');
    return Promise.resolve(
      new Response(JSON.stringify(next.body), {
        status: next.status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
}

const place = (n: number, name: string, category: string): DraftPoi => ({
  id: `0199c000-0001-7000-8000-00000000000${n}`,
  name,
  category,
  lat: 21.03 + n / 1000,
  lng: 105.85,
  tz: 'Asia/Ho_Chi_Minh',
  hours: null,
  priceLevel: null,
  tags: [],
  durationMin: 90,
  editorial: true,
  mustSee: false,
});

const PLACES = [
  place(1, 'Dong Xuan Market', 'market'),
  place(2, 'Temple of Literature', 'temple_shrine'),
  place(3, 'Vietnam Museum of Ethnology', 'museum'),
  place(4, 'Hoan Kiem Lake', 'nature'),
  place(5, 'Hoa Lo Prison', 'museum'),
];

const TRIP: DraftTripData = {
  tripId: '0199c000-0002-7000-8000-000000000001',
  crewId: '0199c000-0002-7000-8000-000000000002',
  status: 'drafting',
  startDate: '2026-02-15',
  endDate: '2026-02-19',
  tz: 'Asia/Ho_Chi_Minh',
  currency: 'USD',
  destinationId: '0199c000-0002-7000-8000-000000000003',
  destination: 'Hanoi, Vietnam',
  guideSlug: 'guest',
  members: [
    { uid: '0199c000-0003-7000-8000-000000000001', name: 'Mai', tastes: ['markets'] },
    { uid: '0199c000-0003-7000-8000-000000000002', name: 'Rin', tastes: ['history'] },
  ],
  mustDos: [],
  diets: [],
  dietsBy: [],
  budget: null,
  rooms: null,
  bands: null,
};

describe('pre-draft closure check', () => {
  it('keeps a place with a cited closure out of the draft and its text out of the prompt', async () => {
    const check = webClosureCheck({
      search: createTavilySearch({ apiKey: 'fixture-key', fetch: queue(RECORDED.tavily) }),
      gateway: createGateway({
        apiKey: 'fixture-key',
        maxAttempts: 1,
        fetch: queue(RECORDED.deepseek),
      }),
    });
    const closures = await check(TRIP, PLACES);
    const market = closures.find((c) => c.poi_id === PLACES[0]?.id);
    expect(market).toMatchObject({ closed_from: '2026-02-15', closed_to: '2026-02-19' });
    expect(market?.source_url).toMatch(/^https:\/\//u);

    const input = buildPlanInput(TRIP, PLACES, {
      jobId: '0199c000-0004-7000-8000-000000000001',
      skeletonRoute: 'draft.skeleton',
      closures,
    });
    expect(input.pools.openDays.has(PLACES[0]?.id as string)).toBe(false);
    expect(input.pools.activities.map((p) => p.id)).not.toContain(PLACES[0]?.id);

    const onTet = validateItinerary({
      itinerary: {
        currency: 'USD',
        days: [
          {
            day_no: 2,
            date: '2026-02-16',
            theme: 'Old Quarter',
            items: [
              {
                stable_id: '0199c000-0005-7000-8000-000000000001',
                kind: 'activity',
                poi_id: PLACES[0]?.id ?? null,
                starts_at: '2026-02-16T03:00:00.000Z',
                ends_at: '2026-02-16T04:30:00.000Z',
                tz: 'Asia/Ho_Chi_Minh',
                must_do_id: null,
                booking_id: null,
                locked_reason: null,
                cost_model: 'per_person',
                amount_minor: 0,
                currency: 'USD',
                travel_min: 0,
                note: null,
              },
            ],
          },
        ],
      },
      pois: input.pois,
      frame: input.frame,
      travel: input.travel,
      requiredMustDoIds: [],
    });
    expect(onTet.violations.map((v) => v.code)).toContain('CLOSED_ON_DATE');

    const prompt = JSON.stringify(buildSkeletonRequest(input));
    for (const closure of closures) {
      expect(prompt).not.toContain(closure.source_url);
      expect(prompt).not.toContain(closure.reason);
    }
    expect(prompt).not.toContain('Dong Xuan Market');
  });
});
