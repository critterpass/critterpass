/**
 * What "Download my data" holds: one JSON file per area, each the requester's own rows only (rows
 * they own, wrote or are named in as payer, debtor or participant), never a crewmate's profile,
 * private rows or messages. Tokens, keys and other secrets are not the person's data and stay out.
 * Every query takes the requester's uid as `$1` and runs as the system role.
 */
import type pg from 'pg';

export interface ExportSection {
  /** The file inside the zip, `<area>/<name>.json`. */
  readonly file: string;
  readonly sql: string;
}

const own = (file: string, table: string, column = 'user_id'): ExportSection => ({
  file,
  sql: `SELECT * FROM ${table} WHERE ${column} = $1`,
});

export const EXPORT_SECTIONS: readonly ExportSection[] = [
  {
    file: 'profile/profile.json',
    sql: `SELECT id, display_name, username, home_airport, home_country, home_currency, locale, tz,
            member_since, languages, created_at
       FROM users WHERE id = $1`,
  },
  own('profile/settings.json', 'user_settings'),
  own('profile/taste.json', 'taste_profiles'),
  own('profile/pass.json', 'passes'),
  own('profile/stamps.json', 'stamps'),
  own('profile/past-trips.json', 'past_trips'),
  {
    file: 'profile/avatars.json',
    sql: `SELECT id, kind, form_id, ring, media_key, moderation_status, created_at
       FROM avatars WHERE user_id = $1`,
  },
  own('profile/consents.json', 'consents'),
  {
    file: 'crews/memberships.json',
    sql: `SELECT m.crew_id, c.name AS crew_name, m.role, m.status, m.created_at
       FROM crew_members m JOIN crews c ON c.id = m.crew_id WHERE m.user_id = $1`,
  },
  {
    file: 'trips/trips.json',
    sql: `SELECT p.trip_id, d.name AS destination, t.start_date, t.end_date, p.rsvp, p.created_at
       FROM trip_participants p JOIN trips t ON t.id = p.trip_id
       LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE p.user_id = $1`,
  },
  {
    file: 'chat/messages.json',
    sql: `SELECT id, crew_id, type, body, created_at, edited_at, deleted_at
       FROM messages WHERE sender_id = $1 ORDER BY created_at`,
  },
  {
    file: 'chat/reactions.json',
    sql: 'SELECT message_id, emoji, created_at FROM message_reactions WHERE user_id = $1',
  },
  {
    file: 'money/expenses.json',
    sql: 'SELECT * FROM expenses WHERE payer_id = $1 OR created_by = $1',
  },
  own('money/expense-shares.json', 'expense_shares'),
  {
    file: 'money/ledger.json',
    sql: 'SELECT * FROM ledger_entries WHERE debtor_id = $1 OR creditor_id = $1',
  },
  {
    file: 'money/payments.json',
    sql: 'SELECT * FROM payments WHERE from_id = $1 OR to_id = $1',
  },
  {
    file: 'bookings/bookings.json',
    sql: 'SELECT * FROM bookings WHERE owner_id = $1 OR paid_by = $1',
  },
  own('critters/collection.json', 'collection_entries'),
  own('places/saved.json', 'saved_items'),
  own('votes/ballots.json', 'ballots'),
];

/** Rows to JSON: bigints as numbers when safe, dates as ISO strings. */
export function toJson(rows: readonly unknown[]): string {
  return JSON.stringify(
    rows,
    (_key, value: unknown) =>
      typeof value === 'bigint'
        ? Number.isSafeInteger(Number(value))
          ? Number(value)
          : value.toString()
        : value,
    2,
  );
}

export async function readSections(
  tx: pg.PoolClient,
  uid: string,
): Promise<{ readonly file: string; readonly json: string; readonly rows: number }[]> {
  const out = [];
  for (const section of EXPORT_SECTIONS) {
    const { rows } = await tx.query(section.sql, [uid]);
    out.push({ file: section.file, json: toJson(rows), rows: rows.length });
  }
  return out;
}

/** The person's own uploads (avatars, photos, voice notes), largest last, for the media folder. */
export async function ownMedia(
  tx: pg.PoolClient,
  uid: string,
): Promise<{ readonly key: string; readonly bytes: number; readonly kind: string }[]> {
  const { rows } = await tx.query<{ r2_key: string; bytes: string; kind: string }>(
    'SELECT r2_key, bytes, kind FROM media_objects WHERE owner_id = $1 ORDER BY bytes, created_at',
    [uid],
  );
  return rows.map((row) => ({ key: row.r2_key, bytes: Number(row.bytes), kind: row.kind }));
}
