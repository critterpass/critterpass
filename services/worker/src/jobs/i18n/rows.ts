/**
 * The rows a `guide_text.translate` sweep looks at, and who reads them.
 *
 * A trip sweep covers the trip's live plan versions (every version not superseded, organiser-only
 * drafts included, so a plan is already translated when it is published), its members' briefings
 * from yesterday on, its quests still open or just ended, its disruptions open or closed within a
 * day, its forecast watch rows still ahead, and its recap's card copy and award words. A crew
 * sweep covers the crew's
 * pitches still in play. Shared rows are read by everyone on the trip (travellers not out, and the
 * crew's active members); a briefing line is read by its owner alone.
 *
 * Text a person typed is never translated: a plan item is translated only when the guide created
 * it, and only while its note is the one the guide wrote (never translated yet, or translated from
 * exactly this text). A note edited after it was translated reads as typed for everyone.
 */
import {
  GUIDE_TEXT_FIELDS,
  GUIDE_TEXT_SRC_KEY,
  guideTextIsCurrent,
  guideTextLocales,
  guideTextSourceHash,
  parseGuideTextI18n,
  pitchGuideTextSource,
  pitchSectionsSchema,
  recapGuideTextSource,
  SOURCE_APP_LOCALE,
  type GuideTextI18n,
  type GuideTextKind,
  type GuideTextSource,
} from '@cp/domain';
import type pg from 'pg';

export interface GuideTextRow {
  readonly kind: GuideTextKind;
  readonly id: string;
  readonly source: GuideTextSource;
  readonly i18n: GuideTextI18n | null;
  /** The one person who reads this row (a briefing line); null = everyone in the sweep's audience. */
  readonly ownerLocale: string | null;
}

export const GUIDE_TEXT_TABLES: Readonly<Record<GuideTextKind, string>> = {
  plan_day: 'plan_days',
  plan_item: 'plan_items',
  briefing_item: 'briefing_items',
  quest: 'quests',
  pitch: 'pitches',
  disruption: 'disruptions',
  watch_item: 'watch_items',
  recap: 'recaps',
  recap_award: 'recap_awards',
};

interface Raw {
  id: string;
  i18n: unknown;
  owner_locale?: string | null;
  [column: string]: unknown;
}

function toRow(kind: GuideTextKind, raw: Raw): GuideTextRow {
  const columns = (): GuideTextSource =>
    Object.fromEntries(
      GUIDE_TEXT_FIELDS[kind].map((field) => {
        const text = raw[field.name];
        return [field.name, typeof text === 'string' ? text : null];
      }),
    );
  const sections = raw['sections'];
  const source =
    kind === 'pitch'
      ? pitchGuideTextSource(pitchSectionsSchema.partial().catch({}).parse(sections))
      : kind === 'recap'
        ? recapGuideTextSource(raw['cards'])
        : columns();
  return {
    kind,
    id: raw.id,
    source,
    i18n: parseGuideTextI18n(raw.i18n),
    ownerLocale: raw.owner_locale ?? null,
  };
}

export interface TripSweep {
  readonly guideSlug: string | null;
  /** Someone on the trip, to read the guide's approved persona as. */
  readonly readerUid: string | null;
  /** The languages the trip's shared text is read in (the source language included). */
  readonly locales: readonly string[];
  readonly rows: readonly GuideTextRow[];
}

const TRIP_AUDIENCE = `
  SELECT tp.user_id FROM trip_participants tp WHERE tp.trip_id = $1 AND tp.rsvp <> 'out'
  UNION
  SELECT cm.user_id FROM crew_members cm JOIN trips t ON t.crew_id = cm.crew_id
   WHERE t.id = $1 AND cm.status = 'active'`;

export async function loadTripSweep(tx: pg.PoolClient, tripId: string): Promise<TripSweep | null> {
  const trip = await tx.query<{ guide_slug: string | null }>(
    'SELECT g.slug AS guide_slug FROM trips t LEFT JOIN guides g ON g.id = t.guide_id WHERE t.id = $1',
    [tripId],
  );
  if (trip.rows[0] === undefined) return null;
  const audience = await tx.query<{ user_id: string; locale: string }>(
    `SELECT a.user_id, app.user_locale(a.user_id) AS locale FROM (${TRIP_AUDIENCE}) a ORDER BY 1`,
    [tripId],
  );
  const days = await tx.query<Raw>(
    `SELECT d.id, d.theme, d.i18n FROM plan_days d
       JOIN itinerary_versions v ON v.id = d.version_id
      WHERE d.trip_id = $1 AND v.status <> 'superseded' AND d.theme <> ''
      ORDER BY v.created_at, v.id, d.day_no`,
    [tripId],
  );
  const items = await tx.query<Raw>(
    `SELECT i.id, i.notes, i.i18n FROM plan_items i
       JOIN itinerary_versions v ON v.id = i.version_id
      WHERE i.trip_id = $1 AND v.status <> 'superseded' AND i.created_by_kind = 'guide'
        AND i.notes <> ''
      ORDER BY v.created_at, v.id, i.starts_at, i.id`,
    [tripId],
  );
  const briefing = await tx.query<Raw>(
    `SELECT bi.id, bi.text, bi.i18n, app.user_locale(bi.user_id) AS owner_locale
       FROM briefing_items bi JOIN briefings b ON b.id = bi.briefing_id
      WHERE bi.trip_id = $1 AND b.local_date >= (now() - interval '2 days')::date
      ORDER BY b.local_date, bi.user_id, bi.position, bi.id`,
    [tripId],
  );
  const quests = await tx.query<Raw>(
    `SELECT q.id, q.title, q.body, q.i18n FROM quests q
      WHERE q.trip_id = $1 AND q.ends_at > now() - interval '1 day'
      ORDER BY q.local_date, q.slot`,
    [tripId],
  );
  const disruptions = await tx.query<Raw>(
    `SELECT d.id, d.title, d.summary, d.i18n FROM disruptions d
      WHERE d.trip_id = $1 AND (d.title <> '' OR d.summary <> '')
        AND (d.status = 'open' OR d.resolved_at > now() - interval '1 day')
      ORDER BY d.detected_at, d.id`,
    [tripId],
  );
  const watch = await tx.query<Raw>(
    `SELECT w.id, w.title, w.detail, w.i18n FROM watch_items w
      WHERE w.trip_id = $1 AND w.resolved_at IS NULL AND w.title <> ''
        AND w.day >= (now() - interval '1 day')::date
      ORDER BY w.day, w.id`,
    [tripId],
  );
  // The recap once the guide has worded it, and the awards' words (the copy is never typed by a
  // person, so every version is translated).
  const recap = await tx.query<Raw>(
    'SELECT r.id, r.cards, r.i18n FROM recaps r WHERE r.trip_id = $1 AND r.copy_version > 0',
    [tripId],
  );
  const awards = await tx.query<Raw>(
    `SELECT a.id, a.title, a.line, a.i18n FROM recap_awards a JOIN recaps r ON r.id = a.recap_id
      WHERE a.trip_id = $1 AND r.copy_version > 0 AND a.title IS NOT NULL
      ORDER BY a.user_id`,
    [tripId],
  );
  return {
    guideSlug: trip.rows[0].guide_slug,
    readerUid: audience.rows[0]?.user_id ?? null,
    locales: [...new Set(audience.rows.map((row) => row.locale))],
    rows: [
      ...days.rows.map((raw) => toRow('plan_day', raw)),
      // A note that no longer matches its translations was edited by a person: left as typed.
      ...items.rows
        .map((raw) => toRow('plan_item', raw))
        .filter(
          (row) => row.i18n === null || guideTextIsCurrent('plan_item', row.source, row.i18n),
        ),
      ...briefing.rows.map((raw) => toRow('briefing_item', raw)),
      ...quests.rows.map((raw) => toRow('quest', raw)),
      ...disruptions.rows.map((raw) => toRow('disruption', raw)),
      ...watch.rows.map((raw) => toRow('watch_item', raw)),
      ...recap.rows.map((raw) => toRow('recap', raw)),
      ...awards.rows.map((raw) => toRow('recap_award', raw)),
    ],
  };
}

export interface CrewSweep {
  readonly readerUid: string | null;
  readonly locales: readonly string[];
  readonly rows: readonly GuideTextRow[];
}

export async function loadCrewSweep(tx: pg.PoolClient, crewId: string): Promise<CrewSweep> {
  const audience = await tx.query<{ user_id: string; locale: string }>(
    `SELECT cm.user_id, app.user_locale(cm.user_id) AS locale FROM crew_members cm
      WHERE cm.crew_id = $1 AND cm.status = 'active' ORDER BY 1`,
    [crewId],
  );
  const pitches = await tx.query<Raw>(
    `SELECT p.id, p.sections, p.i18n FROM pitches p
      WHERE p.crew_id = $1 AND p.status IN ('pitched', 'on_board', 'queued', 'final')
      ORDER BY p.created_at, p.id`,
    [crewId],
  );
  return {
    readerUid: audience.rows[0]?.user_id ?? null,
    locales: [...new Set(audience.rows.map((row) => row.locale))],
    rows: pitches.rows.map((raw) => toRow('pitch', raw)),
  };
}

/** The languages `row` still has to be translated into, given who reads it. */
export function missingLocales(row: GuideTextRow, audience: readonly string[]): string[] {
  const wanted = row.ownerLocale === null ? audience : [row.ownerLocale];
  const have = new Set(guideTextLocales(row.kind, row.source, row.i18n));
  return wanted.filter((locale) => locale !== SOURCE_APP_LOCALE && !have.has(locale));
}

/**
 * Stores one language's fields on a row. Translations made from the same source text are kept
 * next to it; anything made from other text is dropped with the old `_src`. A `null` field is a
 * line the model could not translate within the rules: its readers keep the source text and the
 * next sweep does not ask again.
 */
export async function storeTranslation(
  tx: pg.PoolClient,
  row: GuideTextRow,
  locale: string,
  fields: Readonly<Record<string, string | null>>,
): Promise<void> {
  const src = guideTextSourceHash(row.kind, row.source);
  await tx.query(
    `UPDATE ${GUIDE_TEXT_TABLES[row.kind]}
        SET i18n = (CASE WHEN i18n->>'${GUIDE_TEXT_SRC_KEY}' = $2 THEN i18n ELSE '{}'::jsonb END)
                   || $3::jsonb
      WHERE id = $1`,
    [row.id, src, JSON.stringify({ [GUIDE_TEXT_SRC_KEY]: src, [locale]: fields })],
  );
}
