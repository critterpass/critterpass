/**
 * Who a notification goes to and what the router needs to know about each recipient: their
 * preferences (defaults while they have never changed any), the language their app is in
 * (`app.user_locale`), the time zone their day runs in, and whether the app is on screen right now.
 *
 * Time zone (docs/product-decisions.md, roundup zone): while the recipient is on a trip under way
 * the trip's zone is their day; otherwise their most recently seen device's zone, then their
 * profile zone, then UTC. `roundup_tz = 'device'` opts the evening roundup out of the trip zone.
 */
import { DEFAULT_BUDGET_PER_DAY, type NotificationPrefGate } from '@cp/domain';
import type pg from 'pg';

import { clockMinutes, type QuietHours } from './policy';

/** A device that reported "on screen" this recently is treated as foreground. */
const FOREGROUND_FRESH_MS = 60 * 60 * 1000;

export interface RecipientPrefs {
  readonly budgetPerDay: number;
  readonly roundupMinutes: number;
  readonly roundupTz: 'trip' | 'device';
  readonly quiet: QuietHours;
  readonly gates: Readonly<Record<NotificationPrefGate, boolean>>;
  readonly perCategory: Readonly<Record<string, boolean>>;
  readonly voiceReadout: boolean;
}

export interface Recipient {
  readonly uid: string;
  readonly locale: string;
  /** The zone the recipient's day (ledger, quiet hours) runs in. */
  readonly tz: string;
  /** The zone the evening roundup is scheduled in. */
  readonly roundupTz: string;
  readonly inForeground: boolean;
  readonly prefs: RecipientPrefs;
}

interface RecipientRow {
  locale: string;
  user_tz: string | null;
  trip_tz: string | null;
  device_tz: string | null;
  foreground: boolean | null;
  last_seen_at: Date | null;
  budget_per_day: number | null;
  roundup_time: string | null;
  roundup_tz: 'trip' | 'device' | null;
  quiet_from: string | null;
  quiet_to: string | null;
  guide_tips: boolean | null;
  money: boolean | null;
  critters_nearby: boolean | null;
  crew_chat_mode: string | null;
  per_category: Record<string, boolean> | null;
  voice_readout: boolean | null;
}

/** Trip zone of a trip under way the user is travelling on (not dropped out of). */
export const ON_TRIP_TZ_SQL = `
  SELECT t.tz FROM trip_participants tp JOIN trips t ON t.id = tp.trip_id
  WHERE tp.user_id = u.id AND tp.rsvp <> 'out' AND t.status = 'in_trip' AND t.tz IS NOT NULL
  ORDER BY t.start_date DESC NULLS LAST LIMIT 1`;

/** Loads one recipient; `undefined` when the user no longer exists. */
export async function loadRecipient(
  tx: pg.PoolClient,
  uid: string,
  now: Date,
): Promise<Recipient | undefined> {
  const { rows } = await tx.query<RecipientRow>(
    `SELECT app.user_locale(u.id) AS locale, u.tz AS user_tz, (${ON_TRIP_TZ_SQL}) AS trip_tz,
       d.tz AS device_tz, d.foreground, d.last_seen_at,
       p.budget_per_day, p.roundup_time::text, p.roundup_tz, p.quiet_from::text,
       p.quiet_to::text, p.guide_tips, p.money, p.critters_nearby, p.crew_chat_mode,
       p.per_category, p.voice_readout
     FROM users u
     LEFT JOIN LATERAL (
       SELECT tz, foreground, last_seen_at FROM devices
       WHERE user_id = u.id ORDER BY last_seen_at DESC LIMIT 1
     ) d ON true
     LEFT JOIN notification_prefs p ON p.user_id = u.id
     WHERE u.id = $1 AND u.status NOT IN ('closed', 'purged')`,
    [uid],
  );
  const row = rows[0];
  if (row === undefined) return undefined;
  const homeTz = row.device_tz ?? row.user_tz ?? 'UTC';
  const dayTz = row.trip_tz ?? homeTz;
  const roundupTz = row.roundup_tz ?? 'trip';
  return {
    uid,
    locale: row.locale,
    tz: dayTz,
    roundupTz: roundupTz === 'trip' ? dayTz : homeTz,
    inForeground:
      row.foreground === true &&
      row.last_seen_at !== null &&
      now.getTime() - row.last_seen_at.getTime() < FOREGROUND_FRESH_MS,
    prefs: {
      budgetPerDay: row.budget_per_day ?? DEFAULT_BUDGET_PER_DAY,
      roundupMinutes: clockMinutes(row.roundup_time ?? '20:00'),
      roundupTz,
      quiet: {
        fromMinutes: clockMinutes(row.quiet_from ?? '22:00'),
        toMinutes: clockMinutes(row.quiet_to ?? '07:00'),
      },
      gates: {
        guide_tips: row.guide_tips ?? true,
        money: row.money ?? true,
        critters_nearby: row.critters_nearby ?? true,
        crew_chat: (row.crew_chat_mode ?? 'all') !== 'off',
      },
      perCategory: row.per_category ?? {},
      voiceReadout: row.voice_readout ?? false,
    },
  };
}

/** Active members of a crew, minus `exclude` (usually the actor). */
export async function crewAudience(
  tx: pg.PoolClient,
  crewId: string,
  exclude: readonly string[] = [],
): Promise<string[]> {
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT user_id FROM crew_members
     WHERE crew_id = $1 AND status = 'active' AND NOT (user_id = ANY($2::uuid[]))`,
    [crewId, exclude],
  );
  return rows.map((row) => row.user_id);
}

/** Everyone still on a trip (any RSVP but out), minus `exclude`. */
export async function tripAudience(
  tx: pg.PoolClient,
  tripId: string,
  exclude: readonly string[] = [],
): Promise<string[]> {
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT user_id FROM trip_participants
     WHERE trip_id = $1 AND rsvp <> 'out' AND NOT (user_id = ANY($2::uuid[]))`,
    [tripId, exclude],
  );
  return rows.map((row) => row.user_id);
}
