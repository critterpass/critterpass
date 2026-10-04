/**
 * The morning briefing's candidates for one member, trip and local date, computed from facts only
 * (the model words them, never adds to them): the day's leave-by, who is still asleep (organisers
 * only), the first item, a flight, a free-cancellation deadline, their balance, an open vote and a
 * queued question the guide answered. Each carries the only values its line may cite. Reads run as
 * app_system and select crew-visible or the member's own rows only; nothing C3 is read.
 */
import { formatMoney, money } from '@cp/cost-engine';
import {
  localSchedule,
  toLocalWallTime,
  tripDayPath,
  tripHubPath,
  type BriefingCandidate,
} from '@cp/domain';
import { joinNames } from '@cp/planner';
import type pg from 'pg';

import { leaveByBriefingLine, type LeaveByPushFacts } from './leave-by-push-copy';

type Draft = Omit<BriefingCandidate, 'id'>;

export interface CandidateScope {
  readonly tripId: string;
  readonly userId: string;
  readonly localDate: string;
  readonly tz: string;
  readonly now: Date;
}

const hhmm = (at: Date, tz: string) => toLocalWallTime(at, tz).time.slice(0, 5);

/** "today 18:00", "tomorrow 12:00" or "Oct 16 18:00" on the trip's clock. */
function when(at: Date, scope: CandidateScope): string {
  const date = toLocalWallTime(at, scope.tz).date;
  const next = toLocalWallTime(
    new Date(
      localSchedule({ date: scope.localDate, time: '12:00', tz: scope.tz }).getTime() + 86_400_000,
    ),
    scope.tz,
  ).date;
  if (date === scope.localDate) return `today ${hhmm(at, scope.tz)}`;
  if (date === next) return `tomorrow ${hhmm(at, scope.tz)}`;
  const day = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: scope.tz });
  return `${day.format(at)} ${hhmm(at, scope.tz)}`;
}

async function leaveBys(tx: pg.PoolClient, scope: CandidateScope): Promise<Draft[]> {
  const { rows } = await tx.query<
    Omit<LeaveByPushFacts, 'tz'> & {
      id: string;
      pickup_place: string | null;
      organiser: boolean;
      asleep: string[] | null;
      asleep_ids: string[] | null;
    }
  >(
    `SELECT l.id, l.title, l.place_name, l.starts_at, l.leave_at,
            l.legs->0->>'kind' AS leg_kind, l.pickup->>'place' AS pickup_place,
            (SELECT i.category FROM plan_items i WHERE i.id = l.plan_item_id) AS category,
            (SELECT s.dep_airport::text FROM flight_segments s
               JOIN plan_items i ON i.booking_id = s.booking_id
              WHERE i.id = l.plan_item_id AND s.sched_dep_at = l.starts_at
              ORDER BY s.segment_no LIMIT 1) AS dep_airport,
            EXISTS (SELECT 1 FROM trip_participants p
                     WHERE p.trip_id = l.trip_id AND p.user_id = $2 AND p.role = 'organiser') AS organiser,
            (SELECT array_agg(split_part(trim(u.display_name), ' ', 1) ORDER BY u.display_name)
               FROM readiness r JOIN users u ON u.id = r.user_id
              WHERE r.leave_by_id = l.id AND r.state = 'not_up' AND r.user_id <> $2) AS asleep,
            (SELECT array_agg(r.user_id ORDER BY r.user_id) FROM readiness r
              WHERE r.leave_by_id = l.id AND r.state = 'not_up' AND r.user_id <> $2) AS asleep_ids
       FROM leave_bys l
      WHERE l.trip_id = $1 AND l.local_date = $3::date AND $2 = ANY (l.participant_ids)
        AND l.state NOT IN ('cancelled', 'departed') AND l.leave_at > $4
      ORDER BY l.leave_at`,
    [scope.tripId, scope.userId, scope.localDate, scope.now],
  );
  return rows.flatMap((row): Draft[] => {
    // The briefing reads on the member's trip clock, like every other time in it.
    const line = leaveByBriefingLine({ ...row, tz: scope.tz }, row.pickup_place);
    const drafts: Draft[] = [
      {
        kind: 'leave_by',
        action: 'open',
        icon: 'alarm',
        priority: 90,
        facts: line.facts,
        template: line.template,
        target_user_ids: [],
        deep_link: tripDayPath(scope.tripId, scope.localDate),
        dedupe_key: `leave_by:${row.id}`,
      },
    ];
    const names = (row.asleep ?? []).filter((name) => name.length > 0);
    if (row.organiser && names.length > 0 && row.asleep_ids !== null) {
      const who = joinNames(names);
      const place = row.place_name ?? row.title;
      drafts.push({
        kind: 'not_up',
        action: 'nudge',
        icon: 'alarm',
        priority: 80,
        facts: { names: who, place },
        template: `${who} ${names.length === 1 ? 'is' : 'are'} not up yet for ${place}.`.slice(
          0,
          140,
        ),
        target_user_ids: row.asleep_ids.slice(0, 16),
        deep_link: null,
        dedupe_key: `not_up:${row.id}`,
      });
    }
    return drafts;
  });
}

async function dayFacts(tx: pg.PoolClient, scope: CandidateScope): Promise<Draft[]> {
  const from = localSchedule({ date: scope.localDate, time: '00:00', tz: scope.tz });
  const to = new Date(from.getTime() + 86_400_000);
  const drafts: Draft[] = [];
  const first = await tx.query<{ starts_at: Date; title: string }>(
    `SELECT i.starts_at, left(coalesce(p.name, i.notes, initcap(i.category), 'Plan'), 80) AS title
       FROM plan_items i JOIN trips t ON t.current_version_id = i.version_id
       LEFT JOIN pois p ON p.id = i.poi_id
      WHERE t.id = $1 AND i.starts_at >= greatest($2::timestamptz, $4::timestamptz) AND i.starts_at < $3
        AND (cardinality(i.attendee_ids) = 0 OR i.attendee_ids IS NULL OR $5 = ANY (i.attendee_ids))
      ORDER BY i.starts_at LIMIT 1`,
    [scope.tripId, from, to, scope.now, scope.userId],
  );
  const item = first.rows[0];
  if (item !== undefined) {
    const time = hhmm(item.starts_at, scope.tz);
    drafts.push({
      kind: 'first_item',
      action: 'open',
      icon: 'sun',
      priority: 30,
      facts: { time, title: item.title },
      template: `First up: ${item.title} at ${time}.`.slice(0, 140),
      target_user_ids: [],
      deep_link: tripHubPath(scope.tripId),
      dedupe_key: `first:${scope.localDate}`,
    });
  }
  const flights = await tx.query<{
    id: string;
    flight: string;
    at: Date;
    route: string;
    booking_id: string;
  }>(
    `SELECT s.id, s.carrier || ' ' || s.flight_no AS flight, coalesce(s.est_dep_at, s.sched_dep_at) AS at,
            s.dep_airport || ' → ' || s.arr_airport AS route, b.id AS booking_id
       FROM flight_segments s JOIN bookings b ON b.id = s.booking_id
      WHERE b.trip_id = $1 AND b.deleted_at IS NULL AND ($2 = b.owner_id OR $2 = ANY (b.traveller_ids))
        AND coalesce(s.est_dep_at, s.sched_dep_at) >= greatest($3::timestamptz, $5::timestamptz)
        AND coalesce(s.est_dep_at, s.sched_dep_at) < $4
      ORDER BY 3 LIMIT 1`,
    [scope.tripId, scope.userId, from, to, scope.now],
  );
  for (const flight of flights.rows) {
    const time = hhmm(flight.at, scope.tz);
    drafts.push({
      kind: 'flight',
      action: 'open',
      icon: 'plane',
      priority: 85,
      facts: { flight: flight.flight, time, route: flight.route },
      template: `${flight.flight} (${flight.route}) leaves at ${time}.`.slice(0, 140),
      target_user_ids: [],
      deep_link: `/wallet/bookings/${flight.booking_id}`,
      dedupe_key: `flight:${flight.id}`,
    });
  }
  const deadlines = await tx.query<{ id: string; title: string; until: Date }>(
    `SELECT id, left(title, 80) AS title, free_cancel_until AS until FROM bookings
      WHERE trip_id = $1 AND deleted_at IS NULL AND (visibility = 'crew' OR owner_id = $2)
        AND free_cancel_until > $3 AND free_cancel_until < $3::timestamptz + interval '48 hours'
      ORDER BY free_cancel_until LIMIT 2`,
    [scope.tripId, scope.userId, scope.now],
  );
  for (const booking of deadlines.rows) {
    const deadline = when(booking.until, scope);
    drafts.push({
      kind: 'free_cancel',
      action: 'open',
      icon: 'ticket',
      priority: 70,
      facts: { title: booking.title, deadline },
      template: `Free cancellation on ${booking.title} ends ${deadline}.`.slice(0, 140),
      target_user_ids: [],
      deep_link: `/wallet/bookings/${booking.id}`,
      dedupe_key: `free_cancel:${booking.id}`,
    });
  }
  return drafts;
}

async function crewFacts(tx: pg.PoolClient, scope: CandidateScope): Promise<Draft[]> {
  const drafts: Draft[] = [];
  const balance = await tx.query<{ currency: string; net_minor: string }>(
    `SELECT b.currency, b.net_minor::text FROM member_balances b JOIN trips t ON t.crew_id = b.crew_id
      WHERE t.id = $1 AND b.user_id = $2 AND b.net_minor <> 0
      ORDER BY abs(b.net_minor) DESC LIMIT 1`,
    [scope.tripId, scope.userId],
  );
  const net = balance.rows[0];
  if (net !== undefined) {
    const minor = BigInt(net.net_minor);
    const amount = formatMoney(money(minor < 0n ? -minor : minor, net.currency), {
      locale: 'en',
      mode: 'local',
    });
    const owed = minor > 0n;
    drafts.push({
      kind: 'balance',
      action: 'open',
      icon: 'wallet',
      priority: 50,
      facts: { amount, direction: owed ? 'owed to you' : 'you owe' },
      template: owed ? `The crew owes you ${amount}.` : `You owe ${amount} to the crew.`,
      target_user_ids: [],
      deep_link: '/money',
      dedupe_key: `balance:${scope.localDate}`,
    });
  }
  const votes = await tx.query<{ id: string; question: string }>(
    `SELECT p.id, left(p.question, 100) AS question FROM polls p
      WHERE p.trip_id = $1 AND p.status = 'open'
        AND (p.eligible_voter_ids IS NULL OR $2 = ANY (p.eligible_voter_ids))
        AND NOT EXISTS (SELECT 1 FROM ballots b WHERE b.poll_id = p.id AND b.user_id = $2)
      ORDER BY p.closes_at NULLS LAST LIMIT 1`,
    [scope.tripId, scope.userId],
  );
  for (const vote of votes.rows) {
    drafts.push({
      kind: 'open_vote',
      action: 'open',
      icon: 'vote',
      priority: 40,
      facts: { question: vote.question },
      template: `Your vote is still open: ${vote.question}`.slice(0, 140),
      target_user_ids: [],
      deep_link: `/polls/${vote.id}`,
      dedupe_key: `vote:${vote.id}`,
    });
  }
  const answered = await tx.query<{ id: string }>(
    `SELECT id FROM queued_guide_questions
      WHERE user_id = $1 AND trip_id = $2 AND status = 'answered' AND answered_at > $3::timestamptz - interval '24 hours'
      ORDER BY answered_at DESC LIMIT 1`,
    [scope.userId, scope.tripId, scope.now],
  );
  for (const question of answered.rows) {
    drafts.push({
      kind: 'queued_answer',
      action: 'open',
      icon: 'chat',
      priority: 55,
      facts: {},
      template: 'The guide answered the question you queued.',
      target_user_ids: [],
      deep_link: '/guide',
      dedupe_key: `queued:${question.id}`,
    });
  }
  return drafts;
}

/** The day's candidates, numbered `c1`… in priority order. */
export async function briefingCandidates(
  tx: pg.PoolClient,
  scope: CandidateScope,
): Promise<BriefingCandidate[]> {
  const drafts = [
    ...(await leaveBys(tx, scope)),
    ...(await dayFacts(tx, scope)),
    ...(await crewFacts(tx, scope)),
  ].sort((a, b) => b.priority - a.priority);
  return drafts.slice(0, 9).map((draft, index) => ({ ...draft, id: `c${index + 1}` }));
}
