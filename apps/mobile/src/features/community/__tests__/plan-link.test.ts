/**
 * A plan link's token becomes the published plan's id through the api's public plan read. The
 * reader is the network boundary; its answers here are the route's wire shapes.
 */
import { describe, expect, it } from '@jest/globals';
import { publicPlanSchema, type PublicPlan } from '@cp/domain';

import type { ReaderResponse, TravelDataReader } from '@/data/travel-data/client';

import { planLinkPath, resolvePlanLink } from '../link/plan-link';

const TOKEN = 'abcdefghijklmnop';
const PLAN: PublicPlan = {
  kind: 'plan',
  shared_plan_id: '0192f000-0000-7000-8000-00000000c001',
  title: 'Slow Kyoto, fast food',
  destination_name: 'Kyoto',
  days_count: 2,
  travel_month: 4,
  travel_year: 2026,
  crew_size: 4,
  crew_names: null,
  travelled: true,
  tags: ['food'],
  days: [{ day_no: 1, theme: null, places: [{ name: 'Nishiki Market', category: 'market' }] }],
  rating_avg: 4.8,
  rating_count: 12,
  copies_count: 3,
};

function reader(answer: ReaderResponse | Error) {
  const asked: string[] = [];
  const double: TravelDataReader = {
    getJson: (path) => {
      asked.push(path);
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
  };
  return { double, asked };
}

describe('a plan link opened in the app', () => {
  it("asks the public plan read for the token and opens the published plan's id", async () => {
    expect(publicPlanSchema.safeParse(PLAN).success).toBe(true);
    const { double, asked } = reader({ status: 200, body: PLAN });
    expect(await resolvePlanLink(double, TOKEN)).toEqual({
      kind: 'plan',
      sharedPlanId: PLAN.shared_plan_id,
    });
    expect(asked).toEqual([`/v1/public/plan/${TOKEN}`]);
    expect(planLinkPath('a/b')).toBe('/v1/public/plan/a%2Fb');
  });

  it('says the plan is gone for a revoked link, and for an answer that is not a plan', async () => {
    const gone = {
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: 'Not found', retryable: false } },
    };
    expect(await resolvePlanLink(reader(gone).double, TOKEN)).toEqual({ kind: 'gone' });
    const proposal = { status: 200, body: { kind: 'proposal', title: 'Bali in October' } };
    expect(await resolvePlanLink(reader(proposal).double, TOKEN)).toEqual({ kind: 'gone' });
  });

  it('offers another try when there is no answer', async () => {
    expect(await resolvePlanLink(null, TOKEN)).toEqual({ kind: 'unreachable' });
    expect(await resolvePlanLink(reader(new Error('offline')).double, TOKEN)).toEqual({
      kind: 'unreachable',
    });
    expect(await resolvePlanLink(reader({ status: 503, body: null }).double, TOKEN)).toEqual({
      kind: 'unreachable',
    });
  });
});
