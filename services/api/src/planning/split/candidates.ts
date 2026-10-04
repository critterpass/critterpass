/**
 * The ways out of a split, built by code before the guide words any of them: the keen ones go on
 * their own at the place's best slot (with the day's driver when the plan has one), the same idea
 * somewhere everyone can do, or the place at its quietest for everyone. Every candidate is a slot
 * the fit engine found for its attendees, so whatever the guide picks is feasible.
 */
import type { CompromiseCandidate } from '@cp/ai';
import { toLocalWallTime, type DayFit, type PlaceFit } from '@cp/domain';
import type pg from 'pg';

import { similarPlaces } from '../../explore/plan-read';
import { fitForTrip } from '../fit/service';
import { tripStaySource } from '../stay';

export interface SplitCost {
  readonly minor: number;
  readonly currency: string;
  readonly per: 'person' | 'car';
}

export interface SplitCandidate extends CompromiseCandidate {
  readonly poiId: string;
  readonly dayId: string;
  readonly startsAtIso: string;
  readonly endsAtIso: string;
  readonly attendeeIds: readonly string[];
  readonly money: SplitCost | null;
}

export interface SplitPeople {
  readonly crew: readonly string[];
  readonly want: readonly string[];
  readonly names: ReadonlyMap<string, string>;
}

const MAX_CANDIDATES = 6;
const GRADE_RANK = { good: 0, possible: 1, no: 2 } as const;
const DRIVER_CATEGORIES = ['driver', 'transport', 'transfer'];

const ranked = (fit: PlaceFit | undefined): DayFit[] =>
  [...(fit?.days ?? [])]
    .filter((day) => day.grade !== 'no' && day.slot !== null)
    .sort((a, b) => GRADE_RANK[a.grade] - GRADE_RANK[b.grade] || a.day_no - b.day_no);

const driveOf = (day: DayFit): number | null => {
  const reason = day.reasons.find((r) => r.code === 'drive_minutes');
  return reason?.code === 'drive_minutes' ? reason.params.minutes : null;
};

/** "Sat 17" in the trip's zone: the day as the screen and the guide write it. */
export function dayLabel(date: string): string {
  const at = new Date(`${date}T12:00:00Z`);
  const weekday = at.toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' });
  return `${weekday} ${at.getUTCDate()}`;
}

/** "Rp 450,000" style: the currency's own digits, no symbol guessing. */
export function costLine(cost: SplitCost): string {
  const digits = new Intl.NumberFormat('en', {
    style: 'currency',
    currency: cost.currency,
  }).resolvedOptions().maximumFractionDigits;
  const amount = (cost.minor / 10 ** (digits ?? 2)).toLocaleString('en');
  return `${cost.currency} ${amount} ${cost.per === 'car' ? 'for the car' : 'each'}`;
}

async function driverCost(tx: pg.PoolClient, dayId: string): Promise<SplitCost | null> {
  const { rows } = await tx.query<{ amount_minor: string; currency: string }>(
    `SELECT amount_minor, currency FROM plan_items
      WHERE day_id = $1 AND category = ANY($2::text[]) AND amount_minor IS NOT NULL
        AND currency IS NOT NULL AND status IS DISTINCT FROM 'cancelled'
      ORDER BY starts_at NULLS LAST LIMIT 1`,
    [dayId, DRIVER_CATEGORIES],
  );
  const row = rows[0];
  return row === undefined
    ? null
    : { minor: Number(row.amount_minor), currency: row.currency, per: 'car' };
}

export async function buildCandidates(
  tx: pg.PoolClient,
  input: {
    readonly tripId: string;
    readonly destinationId: string | null;
    readonly place: { readonly poiId: string; readonly name: string };
    readonly placeFacts: { readonly category: string; readonly tags: readonly string[] };
    readonly people: SplitPeople;
  },
): Promise<SplitCandidate[]> {
  const { people, place } = input;
  const alternatives = (
    await similarPlaces(tx, {
      destinationId: input.destinationId,
      poiId: place.poiId,
      place: input.placeFacts,
    })
  ).slice(0, 4);
  const fitted = await fitForTrip(
    tx,
    { tripId: input.tripId, poiIds: [place.poiId, ...alternatives.map((alt) => alt.poi_id)] },
    { stays: tripStaySource, now: () => new Date() },
  );
  const fitOf = (poiId: string) => fitted.fits.find((fit) => fit.poi_id === poiId);
  const { rows: days } = await tx.query<{ id: string; date: string }>(
    `SELECT d.id, to_char(d.date, 'YYYY-MM-DD') AS date FROM plan_days d
       JOIN trips t ON t.current_version_id = d.version_id
      WHERE t.id = $1 AND d.date IS NOT NULL`,
    [input.tripId],
  );
  const tz = (
    await tx.query<{ tz: string }>(
      `SELECT coalesce(t.tz, d.tz, 'UTC') AS tz FROM trips t
         LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = $1`,
      [input.tripId],
    )
  ).rows[0]?.tz;
  const zone = tz ?? 'UTC';
  const dateOf = new Map(days.map((day) => [day.id, day.date]));
  const nameOf = (uid: string) => people.names.get(uid) ?? '';
  const everyone = people.crew;

  const candidate = async (
    id: string,
    kind: CompromiseCandidate['kind'],
    poi: { readonly poiId: string; readonly name: string },
    day: DayFit,
    attendeeIds: readonly string[],
    facts: readonly string[],
  ): Promise<SplitCandidate | null> => {
    const date = dateOf.get(day.day_id);
    if (date === undefined || day.slot === null) return null;
    const keen = attendeeIds.length < everyone.length;
    const money = keen ? await driverCost(tx, day.day_id) : null;
    return {
      id,
      kind,
      placeName: poi.name,
      day: dayLabel(date),
      startsAt: toLocalWallTime(new Date(day.slot.starts_at), zone).time.slice(0, 5),
      endsAt: toLocalWallTime(new Date(day.slot.ends_at), zone).time.slice(0, 5),
      attendees: attendeeIds.map(nameOf).filter((name) => name !== ''),
      everyone: !keen,
      goingCount: attendeeIds.length,
      driveMinutes: driveOf(day),
      cost: money === null ? null : costLine(money),
      facts: money === null ? facts : [...facts, 'the day has a driver'],
      poiId: poi.poiId,
      dayId: day.day_id,
      startsAtIso: day.slot.starts_at,
      endsAtIso: day.slot.ends_at,
      attendeeIds,
      money,
    };
  };

  const built: (SplitCandidate | null)[] = [];
  const placeDays = ranked(fitOf(place.poiId));
  const keenDays =
    people.want.length > 0 && people.want.length < everyone.length ? placeDays.slice(0, 2) : [];
  const keen = (index: number) => {
    const day = keenDays[index];
    return day === undefined
      ? null
      : candidate(`keen${index + 1}`, 'split_group', place, day, people.want, [
          'the others have the time free',
        ]);
  };
  // The best of each kind first: the first two are what the templates show without the guide.
  built.push(await keen(0));
  for (const [index, alt] of alternatives.entries()) {
    const best = ranked(fitOf(alt.poi_id))[0];
    if (best === undefined) continue;
    built.push(
      await candidate(
        `alt${index + 1}`,
        'alternative',
        { poiId: alt.poi_id, name: alt.name },
        best,
        everyone,
        [`the same kind of place as ${place.name}`],
      ),
    );
  }
  built.push(await keen(1));
  const quiet = placeDays.find((day) => day.reasons.some((r) => r.code === 'quiet_until'));
  if (quiet !== undefined) {
    built.push(
      await candidate('quiet1', 'reschedule', place, quiet, everyone, ['the quietest time']),
    );
  }
  return built.filter((entry): entry is SplitCandidate => entry !== null).slice(0, MAX_CANDIDATES);
}
