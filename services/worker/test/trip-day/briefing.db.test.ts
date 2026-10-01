/**
 * The morning briefing against a migrated Postgres: the organiser's candidates for Batur day (the
 * leave-by, who is still asleep, the first item), a provider that fails at the network boundary
 * yielding the template briefing with `fallback_used`, one `briefing.built` per day whatever the
 * retries, an event item joining today's briefing once, and the next morning armed.
 */
import { createGateway } from '@cp/ai';
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { briefingCandidates } from '../../src/jobs/trip-day/briefing-candidates';
import { runBriefing } from '../../src/jobs/trip-day/briefing-build';
import { insertBriefingItem } from '../../src/jobs/trip-day/briefing-insert-event';
import { recomputeLeaveBys } from '../../src/jobs/trip-day/leaveby-recompute';
import {
  NOW,
  recordedMapboxRouter,
  startTripDayWorld,
  TRIP_TZ,
  type TripDayWorld,
} from './trip-day-world';

let world: TripDayWorld;
let mayaParticipant: string;
const { router } = recordedMapboxRouter();

/** DeepSeek answering 503 at the network boundary, every time. */
const failing = () =>
  createGateway({
    apiKey: 'replay',
    maxAttempts: 1,
    fetch: () =>
      Promise.resolve(
        new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error' } }), {
          status: 503,
        }),
      ),
  });

beforeAll(async () => {
  world = await startTripDayWorld();
  await recomputeLeaveBys(world.harness.pool, world.tripId, router, NOW);
  await world.q("UPDATE readiness SET state = 'up' WHERE trip_id = $1 AND user_id = $2", [
    world.tripId,
    world.members[1],
  ]);
  const [row] = await world.q<{ id: string }>(
    'SELECT id FROM trip_participants WHERE trip_id = $1 AND user_id = $2',
    [world.tripId, world.members[0]],
  );
  mayaParticipant = row!.id;
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('briefing candidates', () => {
  it('gives the organiser the leave-by, who is asleep and the first item, facts only', async () => {
    const candidates = await withSystem(world.harness.pool, (tx) =>
      briefingCandidates(tx, {
        tripId: world.tripId,
        userId: world.members[0]!,
        localDate: '2026-10-15',
        tz: TRIP_TZ,
        now: NOW,
      }),
    );
    expect(candidates.map((c) => [c.id, c.kind, c.action])).toEqual([
      ['c1', 'leave_by', 'open'],
      ['c2', 'not_up', 'nudge'],
      ['c3', 'first_item', 'open'],
    ]);
    expect(candidates[0]!.facts).toMatchObject({ time: '03:20', place: 'Mount Batur' });
    expect(candidates[1]!.facts).toEqual({ names: 'Alex and Dev', place: 'Mount Batur' });
    expect(candidates[1]!.target_user_ids.sort()).toEqual(
      [world.members[2], world.members[3]].sort(),
    );
    expect(candidates[2]!.template).toBe('First up: Mount Batur at 04:30.');
  });

  it('never tells a member who is not organising who else is asleep', async () => {
    const candidates = await withSystem(world.harness.pool, (tx) =>
      briefingCandidates(tx, {
        tripId: world.tripId,
        userId: world.members[1]!,
        localDate: '2026-10-15',
        tz: TRIP_TZ,
        now: NOW,
      }),
    );
    expect(candidates.map((c) => c.kind)).not.toContain('not_up');
  });
});

describe('briefing.build', () => {
  it('falls back to the template when the model fails, and builds the day once', async () => {
    const first = await runBriefing(world.harness.pool, mayaParticipant, '2026-10-15', {
      writer: failing,
      now: NOW,
    });
    expect(first).toEqual({ outcome: 'template' });
    const [briefing] = await world.q<{ id: string; fallback_used: boolean; status: string }>(
      'SELECT id, fallback_used, status FROM briefings WHERE user_id = $1',
      [world.members[0]],
    );
    expect(briefing).toMatchObject({ fallback_used: true, status: 'ready' });
    const items = await world.q<{ text: string; action: string }>(
      'SELECT text, action FROM briefing_items WHERE briefing_id = $1 ORDER BY position',
      [briefing!.id],
    );
    expect(items).toEqual([
      { text: 'Leave by 03:20 for Mount Batur. Pickup is at the Villa gate.', action: 'open' },
      { text: 'Alex and Dev are not up yet for Mount Batur.', action: 'nudge' },
      { text: 'First up: Mount Batur at 04:30.', action: 'open' },
    ]);
    const again = await runBriefing(world.harness.pool, mayaParticipant, '2026-10-15', {
      writer: failing,
      now: NOW,
    });
    expect(again).toEqual({ outcome: 'already_built' });
    const built = await world.q<{ n: string }>(
      "SELECT count(*) AS n FROM domain_events WHERE type = 'briefing.built' AND trip_id = $1",
      [world.tripId],
    );
    expect(Number(built[0]?.n)).toBe(1);
  });

  it('arms the next morning on the trip clock', async () => {
    const [timer] = await world.q<{ local_at: string; tz: string }>(
      `SELECT local_at::text AS local_at, tz FROM scheduled_events
        WHERE kind = 'briefing.build' AND ref_id = $1 AND status = 'pending'`,
      [mayaParticipant],
    );
    expect(timer).toEqual({ local_at: '2026-10-15 05:00:00', tz: TRIP_TZ });
  });

  it('adds an event item to today’s briefing once', async () => {
    const eventId = '0199a0f2-7c1e-7d4b-9a53-2f3c1d0e9b12';
    const item = {
      trip_id: world.tripId,
      user_ids: [world.members[0]!, world.members[1]!],
      source_event_id: eventId,
      icon: 'plane' as const,
      text: 'Rin’s flight moved to 14:25. I moved her pickup.',
      action: 'open' as const,
      deep_link: null,
    };
    const at = new Date('2026-10-14T23:00:00Z'); // 07:00 on 15 October in Bali
    const added = await withSystem(world.harness.pool, (tx) => insertBriefingItem(tx, item, at));
    const replayed = await withSystem(world.harness.pool, (tx) => insertBriefingItem(tx, item, at));
    expect([added, replayed]).toEqual([2, 0]);
    const rows = await world.q<{ user_id: string; source: string }>(
      'SELECT user_id, source FROM briefing_items WHERE source_event_id = $1',
      [eventId],
    );
    expect(rows).toHaveLength(2);
  });
});
