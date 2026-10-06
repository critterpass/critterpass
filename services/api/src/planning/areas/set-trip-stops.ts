/**
 * `set_trip_stops`: the organiser sets the cities of the trip in order with the nights spent in
 * each, before the crew has a plan. The first stop is the trip's own destination; each next one is
 * a city an onward link leads to from the one before, in the trip's time zone and currency; the
 * nights add up to the trip's. An empty list, or the destination alone, is a one-stop trip again
 * (no rows). The budget, the room plan and the must-do fits go stale as a dates change makes them,
 * and a draft she already has is written again with every day seated in its stop: the stops of a
 * day whose city changed go back to Ideas when their place is outside it.
 * Online only; organiser only; behind `trip.areas`.
 */
import { emitEvent } from '@cp/db';
import { DomainError, setTripStopsPayloadSchema, type SetTripStopsResult } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../../commands/_framework/define-command';
import { markStale } from '../../commands/setup/lock-trip-dates';
import { loadSetupTrip, queueBudgetRecompute, requireOrganiser } from '../../commands/setup/shared';
import { seatDays } from '../../plan/draft-days';
import { loadStopRows, lockTripDraft, writeStopRows } from '../../plan/draft-versioning';
import { loadPlanState } from '../../plan/versioning';
import {
  assertSameZoneAndMoney,
  loadPlaceRules,
  requireTripAreas,
  writeDraftEdit,
} from './day-area-change';

const GUIDE_WORKING = new Set(['drafting', 'redrafting']);

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
}

export const setTripStopsCommand = defineCommand({
  name: 'set_trip_stops',
  v: 1,
  schema: setTripStopsPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireOrganiser(tx, payload.trip_id);
  },
  handle: async (tx, payload, ctx): Promise<SetTripStopsResult> => {
    await requireTripAreas(tx);
    return asSystemRole(tx, async () => {
      const trip = await loadSetupTrip(tx, payload.trip_id, true);
      const { rows: heads } = await tx.query<{ current_version_id: string | null }>(
        'SELECT current_version_id FROM trips WHERE id = $1',
        [trip.id],
      );
      if (heads[0]?.current_version_id != null) {
        throw new DomainError('STATE_INVALID', { reason: 'plan_shared' });
      }
      if (GUIDE_WORKING.has(trip.status)) {
        throw new DomainError('STATE_INVALID', { reason: 'draft_running', state: trip.status });
      }
      if (trip.start_date === null || trip.end_date === null) {
        throw new DomainError('STATE_INVALID', { reason: 'dates_not_locked' });
      }
      const stops = payload.stops;
      const first = stops[0];
      if (first !== undefined && first.destination_id !== trip.destination_id) {
        throw new DomainError('VALIDATION', { reason: 'first_stop' });
      }
      const oneStop = stops.length <= 1;
      if (!oneStop)
        await assertRoute(tx, trip.id, stops, daysBetween(trip.start_date, trip.end_date));

      const before = await loadStopRows(tx, trip.id);
      const kept = await writeStopRows(tx, trip, oneStop ? [] : stops);
      const after = kept.map(({ destination_id, nights }) => ({ destination_id, nights }));
      const result: SetTripStopsResult = { trip_id: trip.id, stops: kept };
      if (JSON.stringify(before) === JSON.stringify(after)) return result;
      await markStale(tx, trip.id, ['budget', 'rooms', 'fits']);
      await queueBudgetRecompute(tx, trip.id, true);
      await emitEvent(tx, {
        type: 'trip.areas_changed',
        aggregateKind: 'trip',
        aggregateId: trip.id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: trip.crew_id,
        tripId: trip.id,
        payload: { trip_id: trip.id },
      });
      // Her draft follows the route: every day seated in its stop, as a new draft.
      const head = await lockTripDraft(tx, trip.id);
      const base = head.draftVersionId;
      if (base === null || trip.destination_id === null) return result;
      const state = await loadPlanState(tx, base);
      const { next, moved } = await seatDays(tx, {
        tripId: trip.id,
        crewId: trip.crew_id,
        uid: ctx.uid,
        destinationId: trip.destination_id,
        state,
        before,
        after,
      });
      if (moved.length === 0 && JSON.stringify(next.days) === JSON.stringify(state.days)) {
        return { ...result, version_id: base };
      }
      const versionId = await writeDraftEdit(tx, head, base, next, ctx.uid);
      return {
        ...result,
        version_id: versionId,
        ...(moved.length === 0 ? {} : { moved_stops: moved }),
      };
    });
  },
});

/** Each next stop is a city an onward link leads to, sharing the trip's zone and money. */
async function assertRoute(
  tx: Parameters<typeof loadPlaceRules>[0],
  tripId: string,
  stops: readonly { destination_id: string; nights: number }[],
  tripNights: number,
): Promise<void> {
  const ids = stops.map((stop) => stop.destination_id);
  const rules = await loadPlaceRules(tx, tripId, ids);
  const { rows: links } = await tx.query<{ from_id: string; to_id: string }>(
    `SELECT from_destination_id AS from_id, to_destination_id AS to_id FROM destination_links
      WHERE kind = 'onward' AND from_destination_id = ANY($1::uuid[])
        AND to_destination_id = ANY($1::uuid[])`,
    [ids],
  );
  const linked = new Set(links.map((link) => `${link.from_id}>${link.to_id}`));
  for (const [index, stop] of stops.entries()) {
    if (index === 0) continue;
    const place = rules.places.get(stop.destination_id);
    const from = stops[index - 1]?.destination_id;
    if (
      place === undefined ||
      place.coverage === 'area' ||
      !linked.has(`${from}>${stop.destination_id}`)
    ) {
      throw new DomainError('VALIDATION', {
        reason: 'not_linked',
        destination_id: stop.destination_id,
      });
    }
    assertSameZoneAndMoney(rules.trip, place, { destination_id: stop.destination_id });
  }
  const nights = stops.reduce((sum, stop) => sum + stop.nights, 0);
  if (nights !== tripNights) {
    throw new DomainError('VALIDATION', { reason: 'stay_nights', nights: tripNights });
  }
}
