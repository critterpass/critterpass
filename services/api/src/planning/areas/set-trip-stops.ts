/**
 * `set_trip_stops`: the organiser sets the cities of the trip in order with the nights spent in
 * each, before the crew has a plan. The first stop is the trip's own destination; each next one is
 * a city an onward link leads to from the one before, in the trip's time zone and currency; the
 * nights add up to the trip's. An empty list, or the destination alone, is a one-stop trip again
 * (no rows). The budget, the room plan and the must-do fits go stale as a dates change makes them.
 * Online only; organiser only; behind `trip.areas`.
 */
import { emitEvent } from '@cp/db';
import { DomainError, setTripStopsPayloadSchema, type SetTripStopsResult } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../../commands/_framework/define-command';
import { markStale } from '../../commands/setup/lock-trip-dates';
import { loadSetupTrip, requireOrganiser } from '../../commands/setup/shared';
import { assertSameZoneAndMoney, loadPlaceRules, requireTripAreas } from './day-area-change';

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

      const { rows: before } = await tx.query<{ destination_id: string; nights: number }>(
        'SELECT destination_id, nights FROM trip_stops WHERE trip_id = $1 ORDER BY position',
        [trip.id],
      );
      await tx.query('DELETE FROM trip_stops WHERE trip_id = $1', [trip.id]);
      const kept = oneStop ? [] : stops;
      if (kept.length > 0) {
        await tx.query(
          `INSERT INTO trip_stops (trip_id, crew_id, position, destination_id, nights)
           SELECT $1, $2, s.position, s.destination_id, s.nights
             FROM unnest($3::uuid[], $4::int[]) WITH ORDINALITY AS s(destination_id, nights, position)`,
          [
            trip.id,
            trip.crew_id,
            kept.map((stop) => stop.destination_id),
            kept.map((stop) => stop.nights),
          ],
        );
      }
      const changed =
        JSON.stringify(before) !==
        JSON.stringify(kept.map(({ destination_id, nights }) => ({ destination_id, nights })));
      if (changed) {
        await markStale(tx, trip.id, ['budget', 'rooms', 'fits']);
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
      }
      return {
        trip_id: trip.id,
        stops: kept.map((stop, index) => ({ position: index + 1, ...stop })),
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
