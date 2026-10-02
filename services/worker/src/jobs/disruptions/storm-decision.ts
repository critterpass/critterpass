/**
 * A watch row newly on PLAN B becomes a storm decision (3k-8): the options come from the planner
 * (swap with the next calm day, keep, skip) priced from the booking's own numbers and its stored
 * cancel quote, and the crew votes on a decision poll (plurality; the organiser breaks a tie)
 * that closes before the item and within a day. Nothing moves until the vote closes
 * (./storm-commit.ts); a deadline with no votes keeps the plan.
 */
import { appendDomainEvent, armPollTimers } from '@cp/db';
import { toLocalWallTime } from '@cp/domain';
import { scoreWatch, stormOptions, type StormBooking, type StormOption } from '@cp/planner';
import type pg from 'pg';

import { readPointForecast } from '../../travel-data/forecast-watch';
import { translateDisruptionWords } from './guide-words';
import type { WatchedTrip } from './watch-score';

const DAY_MS = 86_400_000;
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' });
const dayLabel = (date: string) => WEEKDAY.format(new Date(`${date}T00:00:00Z`));

interface StormItem {
  stable_id: string;
  title: string;
  starts_at: Date;
  ends_at: Date | null;
  attendee_ids: string[];
  kind: string;
  facts: Record<string, string | number>;
  wtitle: string;
  wdetail: string;
  booking_id: string | null;
  partner: string | null;
  order_id: string | null;
  buyer_id: string | null;
  total_minor: string | null;
  currency: string | null;
  cancel_quote: { cancellable?: boolean; refund?: { amount_minor?: number } | null } | null;
  end_date: string | null;
}

async function loadStormItem(
  tx: pg.PoolClient,
  watchItemId: string,
): Promise<StormItem | undefined> {
  const { rows } = await tx.query<StormItem>(
    `SELECT pi.stable_id, left(coalesce(p.name, pi.notes, initcap(pi.category), 'Plan'), 60) AS title,
            pi.starts_at, pi.ends_at,
            coalesce(nullif(pi.attendee_ids, '{}'), ARRAY(SELECT user_id FROM trip_participants tp
              WHERE tp.trip_id = t.id AND tp.rsvp NOT IN ('out', 'waitlisted'))) AS attendee_ids,
            w.kind, w.impact -> 'facts' AS facts, w.title AS wtitle, w.detail AS wdetail,
            pi.booking_id, b.supplier AS partner,
            o.id AS order_id, o.buyer_id, o.total_minor::text, o.currency, o.cancel_quote,
            t.end_date::text
       FROM watch_items w
       JOIN trips t ON t.id = w.trip_id
       JOIN plan_items pi ON pi.version_id = t.current_version_id AND pi.stable_id = w.plan_item_stable_id
       LEFT JOIN pois p ON p.id = pi.poi_id
       LEFT JOIN bookings b ON b.id = pi.booking_id AND b.deleted_at IS NULL
       LEFT JOIN supplier_orders o ON o.stable_id = pi.stable_id AND o.trip_id = t.id
        AND o.supplier = 'viator' AND o.status IN ('confirmed', 'pending_operator')
      WHERE w.id = $1`,
    [watchItemId],
  );
  return rows[0];
}

/** The first day after (then before) the stormy one, inside the trip, the same item would be GO. */
async function calmDay(
  tx: pg.PoolClient,
  trip: WatchedTrip,
  item: StormItem,
  now: Date,
): Promise<string | null> {
  const forecast = await readPointForecast(tx, trip.destinationId, 'centroid');
  for (const days of [1, 2, -1]) {
    const startsAt = new Date(item.starts_at.getTime() + days * DAY_MS);
    const day = toLocalWallTime(startsAt, trip.tz).date;
    if (startsAt <= now || (item.end_date !== null && day > item.end_date)) continue;
    const verdict = scoreWatch(
      {
        stableId: item.stable_id,
        title: item.title,
        day,
        startsAt,
        endsAt: item.ends_at === null ? null : new Date(item.ends_at.getTime() + days * DAY_MS),
        outdoor: true,
        marine: item.kind === 'marine',
        summit: item.kind === 'volcano',
      },
      { weather: forecast.weather, marine: forecast.marine, volcanoLevel: null, crowd: null },
      now,
    );
    const known = forecast.weather.some((hour) => hour.at.startsWith(day));
    if (known && verdict !== null && verdict.status === 'go') return day;
  }
  return null;
}

function bookingOf(item: StormItem): StormBooking {
  if (item.order_id !== null) {
    return {
      supplier: 'viator',
      partner: 'Viator',
      priceMinor: item.total_minor === null ? null : Number(item.total_minor),
      currency: item.currency,
      refundMinor: item.cancel_quote?.refund?.amount_minor ?? null,
      cancellable: item.cancel_quote?.cancellable ?? null,
      seatsOnSwapDay: 'unknown',
      bookerId: item.buyer_id,
    };
  }
  const affiliate = item.booking_id !== null && item.partner !== null && item.partner !== 'viator';
  return {
    supplier: affiliate ? 'affiliate' : 'none',
    partner: affiliate ? item.partner : null,
    priceMinor: null,
    currency: null,
    refundMinor: null,
    cancellable: null,
    seatsOnSwapDay: 'unknown',
    bookerId: null,
  };
}

export async function openStormDecision(
  tx: pg.PoolClient,
  trip: WatchedTrip,
  watchItemId: string,
  now: Date,
): Promise<string | null> {
  const item = await loadStormItem(tx, watchItemId);
  if (item === undefined) return null;
  const day = toLocalWallTime(item.starts_at, trip.tz).date;
  const swap = await calmDay(tx, trip, item, now);
  const booking = bookingOf(item);
  const options = stormOptions({
    title: item.title,
    day,
    dayLabel: dayLabel(day),
    swapDay: swap === null ? null : { day: swap, label: dayLabel(swap) },
    attendeeIds: item.attendee_ids,
    booking,
  }).filter((option) => option.offered);
  const closesAt = new Date(
    Math.max(
      now.getTime() + 10 * 60_000,
      Math.min(now.getTime() + DAY_MS, item.starts_at.getTime() - 12 * 3_600_000),
    ),
  );
  const poll = await tx.query<{ id: string }>(
    `INSERT INTO polls (crew_id, trip_id, kind, question, eligible_voter_ids, closes_at, tie_rule)
     VALUES ($1, $2, 'decision', $3, $4::uuid[], $5, 'organiser_pick') RETURNING id`,
    [trip.crewId, trip.id, `${item.wtitle}`.slice(0, 140), item.attendee_ids, closesAt],
  );
  const pollId = poll.rows[0]?.id as string;
  const withPoll: (StormOption & { poll_option_id: string; swap_day: string | null })[] = [];
  for (const [position, option] of options.entries()) {
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO poll_options (poll_id, crew_id, trip_id, kind, label, position)
       VALUES ($1, $2, $3, 'text', $4, $5) RETURNING id`,
      [pollId, trip.crewId, trip.id, option.label.slice(0, 80), position],
    );
    withPoll.push({ ...option, poll_option_id: inserted.rows[0]?.id as string, swap_day: swap });
  }
  const cause = item.kind === 'volcano' ? 'volcano' : item.facts['waves_m'] ? 'rough_seas' : 'wind';
  const disruption = await tx.query<{ id: string }>(
    `INSERT INTO disruptions (trip_id, kind, cause, dedupe_key, ref_kind, ref_id, title, summary,
       affected, facts, options, source_snapshot, decision_poll_id)
     VALUES ($1, 'storm', $2, $3, 'watch_item', $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [
      trip.id,
      cause,
      `storm:${watchItemId}`,
      watchItemId,
      item.wtitle.slice(0, 120),
      item.wdetail.slice(0, 280),
      JSON.stringify({
        traveller_ids: item.attendee_ids,
        item_stable_ids: [item.stable_id],
        unaffected_ids: [],
      }),
      JSON.stringify(item.facts),
      JSON.stringify(withPoll),
      JSON.stringify({ watch_item_id: watchItemId, day, order_id: item.order_id }),
      pollId,
    ],
  );
  const disruptionId = disruption.rows[0]?.id as string;
  await tx.query('UPDATE watch_items SET disruption_id = $2 WHERE id = $1', [
    watchItemId,
    disruptionId,
  ]);
  await armPollTimers(tx, pollId, null, closesAt, now);
  const scope = { crewId: trip.crewId, tripId: trip.id };
  await appendDomainEvent(tx, {
    type: 'poll.created',
    aggregateKind: 'poll',
    aggregateId: pollId,
    actorKind: 'system',
    actorId: null,
    payload: {
      poll_id: pollId,
      crew_id: trip.crewId,
      trip_id: trip.id,
      kind: 'decision',
      created_by: null,
    },
    ...scope,
  });
  await appendDomainEvent(tx, {
    type: 'disruption.needs_yes',
    aggregateKind: 'trip',
    aggregateId: trip.id,
    actorKind: 'guide',
    actorId: null,
    payload: {
      trip_id: trip.id,
      disruption_id: disruptionId,
      action_id: pollId,
      affected: item.attendee_ids.length,
    },
    ...scope,
  });
  await translateDisruptionWords(tx, trip.id);
  return disruptionId;
}

/** The watcher's PLAN B handoff for sea and volcano rows (rain moves items through a replan). */
export async function stormHandoff(
  tx: pg.PoolClient,
  trip: WatchedTrip,
  watchItemId: string,
  now: Date,
): Promise<void> {
  const { rows } = await tx.query<{ kind: string; open: boolean }>(
    `SELECT w.kind, EXISTS (SELECT 1 FROM disruptions d WHERE d.trip_id = w.trip_id
              AND d.dedupe_key = 'storm:' || w.id::text AND d.status = 'open') AS open
       FROM watch_items w WHERE w.id = $1`,
    [watchItemId],
  );
  const row = rows[0];
  if (row === undefined || row.open || !['marine', 'volcano'].includes(row.kind)) return;
  await openStormDecision(tx, trip, watchItemId, now);
}

/** The forecast improved before the vote closed: the vote is withdrawn and the crew told. */
export async function withdrawStorm(tx: pg.PoolClient, watchItemId: string): Promise<void> {
  const { rows } = await tx.query<{ id: string; trip_id: string; crew_id: string; poll: string }>(
    `UPDATE disruptions d SET status = 'withdrawn', resolved_at = now(), version = version + 1
       FROM trips t
      WHERE t.id = d.trip_id AND d.dedupe_key = 'storm:' || $1::text AND d.status = 'open'
        AND d.chosen_option_id IS NULL
      RETURNING d.id, d.trip_id, t.crew_id, d.decision_poll_id AS poll`,
    [watchItemId],
  );
  for (const storm of rows) {
    await tx.query(
      "UPDATE polls SET status = 'cancelled', version = version + 1 WHERE id = $1 AND status = 'open'",
      [storm.poll],
    );
    await appendDomainEvent(tx, {
      type: 'disruption.resolved',
      aggregateKind: 'trip',
      aggregateId: storm.trip_id,
      actorKind: 'system',
      actorId: null,
      crewId: storm.crew_id,
      tripId: storm.trip_id,
      payload: { trip_id: storm.trip_id, disruption_id: storm.id, status: 'withdrawn' },
    });
  }
}
