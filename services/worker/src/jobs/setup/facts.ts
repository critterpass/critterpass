/**
 * What the setup jobs and pushes read about a trip: its crew's name, the destination, its guide
 * (the push sender and the persona the guide's lines are written in) and zone, plus members' first
 * names and a short date range ("Apr 2–4").
 */
import { GUIDE_SLUGS, type PersonaId } from '@cp/ai';
import type pg from 'pg';

import type { NotificationSender } from '../notify/register';

export const DEFAULT_SETUP_GUIDE: NotificationSender = {
  kind: 'guide',
  id: 'tokek',
  name: 'Tokek',
};

export interface SetupFacts {
  readonly tripId: string;
  readonly crewId: string;
  readonly crew: string;
  readonly place: string;
  readonly tz: string | null;
  readonly guide: NotificationSender;
  readonly persona: PersonaId;
}

export async function setupFacts(
  tx: pg.PoolClient,
  tripId: string,
): Promise<SetupFacts | undefined> {
  const { rows } = await tx.query<{
    crew_id: string;
    crew: string;
    place: string | null;
    tz: string | null;
    guide_slug: string | null;
    guide_name: string | null;
  }>(
    `SELECT t.crew_id, c.name AS crew, d.name AS place, coalesce(t.tz, d.tz) AS tz,
            g.slug AS guide_slug, g.name AS guide_name
       FROM trips t
       JOIN crews c ON c.id = t.crew_id
       LEFT JOIN destinations d ON d.id = t.destination_id
       LEFT JOIN guides g ON g.id = t.guide_id
      WHERE t.id = $1`,
    [tripId],
  );
  const row = rows[0];
  if (row === undefined) return undefined;
  const slug = row.guide_slug ?? '';
  const guide: NotificationSender =
    row.guide_slug !== null && row.guide_name !== null
      ? { kind: 'guide', id: row.guide_slug, name: row.guide_name }
      : DEFAULT_SETUP_GUIDE;
  return {
    tripId,
    crewId: row.crew_id,
    crew: row.crew,
    place: row.place ?? row.crew,
    tz: row.tz,
    guide,
    persona: (GUIDE_SLUGS as readonly string[]).includes(slug) ? (slug as PersonaId) : 'guest',
  };
}

export async function firstName(tx: pg.PoolClient, uid: string): Promise<string> {
  const { rows } = await tx.query<{ name: string | null }>(
    "SELECT split_part(trim(display_name), ' ', 1) AS name FROM users WHERE id = $1",
    [uid],
  );
  return rows[0]?.name ?? '';
}

const monthDay = (date: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );

/** "Apr 2–4", "Apr 30–May 2", or one day ("Apr 2"). */
export function dateRange(start: string, end: string): string {
  if (start === end) return monthDay(start);
  if (start.slice(0, 7) === end.slice(0, 7))
    return `${monthDay(start)}–${Number(end.slice(8, 10))}`;
  return `${monthDay(start)}–${monthDay(end)}`;
}

export const str = (
  event: { readonly payload: Readonly<Record<string, unknown>> },
  key: string,
): string | null => {
  const value = event.payload[key];
  return typeof value === 'string' ? value : null;
};
