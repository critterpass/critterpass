/**
 * The guide area's tool executors, shared by the api and the worker (docs/api-contracts.md §6): `crew_profiles`, `plan_read` and
 * `phrase_card`. Each reads only `llm.*` views as `guide_reader`, scoped to the asking user and the
 * turn's trip (the trip comes from the turn, never from the model's input), so budgets, calendars,
 * private threads and dietary detail never reach the model; dietary flags appear only for members
 * who consented to share them.
 */
import type { RunAsGuideReader } from '../../context/build';
import type { ToolContext, ToolRegistry } from '../../tools/registry';

function tripOf(context: ToolContext): string {
  if (context.tripId === null) throw new Error('this tool needs a trip in context');
  return context.tripId;
}

interface ProfileRow {
  readonly user_id: string;
  readonly first_name: string;
  readonly taste_tags: string[];
  readonly dietary_flags: string[];
  readonly pace: string | null;
  readonly chronotype: string | null;
}

interface PlanRow {
  readonly version_id: string;
  readonly day_no: number;
  readonly date: string | null;
  readonly stable_id: string;
  readonly title: string;
  readonly poi_id: string | null;
  readonly starts_at: Date | null;
  readonly ends_at: Date | null;
  readonly category: string | null;
}

interface TripDatesRow {
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly tz: string | null;
}

type PlanDay = {
  day_no: number;
  date: string | null;
  items: {
    item_id: string;
    title: string;
    poi_id: string | null;
    starts_at: string | null;
    ends_at: string | null;
    category: string | null;
  }[];
};

export async function readCrewProfiles(read: RunAsGuideReader, context: ToolContext) {
  return read(context.uid, tripOf(context), async (tx) => {
    const { rows } = await tx.query<ProfileRow>(
      `SELECT user_id, first_name, taste_tags, dietary_flags, pace, chronotype
         FROM llm.crew_profiles ORDER BY first_name, user_id`,
    );
    return rows.map((row) => ({
      uid: row.user_id,
      first_name: row.first_name,
      taste_tags: row.taste_tags,
      dietary_flags: row.dietary_flags,
      pace: row.pace,
      chronotype: row.chronotype,
    }));
  });
}

/** An instant as the trip's wall clock with its offset (`2026-10-03T14:00:00+07:00`). */
export function tripLocalInstant(at: Date, tz: string | null): string {
  if (tz === null) return at.toISOString();
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'longOffset',
      })
        .formatToParts(at)
        .map((part) => [part.type, part.value]),
    );
    const offset = /([+-]\d{2}:\d{2})/u.exec(parts.timeZoneName ?? '')?.[1] ?? '+00:00';
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
  } catch {
    return at.toISOString();
  }
}

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** Longest trip the plan lists day by day before any item is planned. */
const MAX_TRIP_DAYS = 60;

/**
 * The trip's days, each with its crew plan items in the trip's local time. A day with nothing
 * planned is still listed (from the plan's days, else the trip's dates), a plan with no items still
 * gives its version so the guide can propose the first one, and a trip with no plan yet answers
 * with `version: null` instead of failing, so the guide can say how the plan starts.
 */
export async function readPlan(
  read: RunAsGuideReader,
  context: ToolContext,
  day: number | undefined,
) {
  return read(context.uid, tripOf(context), async (tx) => {
    const trip = await tx.query<TripDatesRow>(
      'SELECT start_date::text AS start_date, end_date::text AS end_date, tz FROM llm.trip_context',
    );
    const { start_date: start = null, end_date: end = null, tz = null } = trip.rows[0] ?? {};
    const { rows } = await tx.query<PlanRow>(
      `SELECT version_id, day_no, date::text AS date, stable_id,
              coalesce(poi_name, notes, category, 'Plan item') AS title,
              poi_id, starts_at, ends_at, category
         FROM llm.plan_items
        WHERE visibility = 'crew'
        ORDER BY day_no, starts_at NULLS LAST, stable_id`,
    );
    // The plan's own days, even with nothing on them: an empty plan is still a plan to add to.
    const plan = await tx.query<{ version_id: string; day_no: number | null; date: string | null }>(
      `SELECT version_id, day_no, date::text AS date FROM llm.plan_version_days
        ORDER BY day_no NULLS FIRST`,
    );
    const days = new Map<number, PlanDay>();
    if (start !== null && end !== null) {
      const count = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
      for (let n = 1; n <= Math.min(count, MAX_TRIP_DAYS); n += 1)
        days.set(n, { day_no: n, date: addDays(start, n - 1), items: [] });
    }
    for (const row of plan.rows) {
      if (row.day_no === null) continue;
      days.set(row.day_no, {
        day_no: row.day_no,
        date: row.date ?? days.get(row.day_no)?.date ?? null,
        items: [],
      });
    }
    for (const row of rows) {
      const entry = days.get(row.day_no) ?? { day_no: row.day_no, date: row.date, items: [] };
      entry.items.push({
        item_id: row.stable_id,
        title: row.title,
        poi_id: row.poi_id,
        starts_at: row.starts_at === null ? null : tripLocalInstant(row.starts_at, tz),
        ends_at: row.ends_at === null ? null : tripLocalInstant(row.ends_at, tz),
        category: row.category,
      });
      days.set(row.day_no, entry);
    }
    const listed = [...days.values()].sort((a, b) => a.day_no - b.day_no);
    return {
      version: plan.rows[0]?.version_id ?? rows[0]?.version_id ?? null,
      days: day === undefined ? listed : listed.filter((entry) => entry.day_no === day),
    };
  });
}

/** A curated card by purpose (its context or key) and language; an address rides under it. */
export async function readPhraseCard(
  read: RunAsGuideReader,
  context: ToolContext,
  input: { purpose: string; language: string; address?: string | undefined },
) {
  return read(context.uid, context.tripId, async (tx) => {
    const { rows } = await tx.query<{ key: string; text: string; gloss: string }>(
      `SELECT key, text, gloss FROM llm.phrase_cards
        WHERE language = $1 AND (context = $2 OR key = $2)
        ORDER BY key LIMIT 1`,
      [input.language, input.purpose],
    );
    const card = rows[0];
    if (card === undefined) throw new Error('no curated phrase card for this purpose');
    const address = input.address?.trim();
    return {
      text: address === undefined || address === '' ? card.text : `${card.text}\n${address}`,
      gloss: card.gloss,
      // Curated audio is the card's own; a card with an address is read by the device.
      audio_ref: address === undefined || address === '' ? `phrase_card:${card.key}` : null,
    };
  });
}

export function registerGuideToolExecutors(registry: ToolRegistry, read: RunAsGuideReader): void {
  registry.registerToolExecutor('crew_profiles', (_input, context) =>
    readCrewProfiles(read, context),
  );
  registry.registerToolExecutor('plan_read', (input, context) =>
    readPlan(read, context, input.day),
  );
  registry.registerToolExecutor('phrase_card', (input, context) =>
    readPhraseCard(read, context, input),
  );
}

/**
 * The trip's crew names, cut from every web search query the guide writes: whole display names,
 * and each name part of three letters or more that is not also part of the destination's name.
 */
export function crewNameTerms(read: RunAsGuideReader) {
  return async (context: ToolContext): Promise<string[]> => {
    if (context.tripId === null) return [];
    return read(context.uid, context.tripId, async (tx) => {
      const { rows } = await tx.query<{
        participants: { display_name: string | null }[] | null;
        destination_name: string | null;
      }>('SELECT participants, destination_name FROM llm.trip_context');
      const row = rows[0];
      const place = new Set((row?.destination_name ?? '').toLowerCase().split(/\s+/u));
      return (row?.participants ?? []).flatMap(({ display_name: name }) => {
        if (name === null || name.trim() === '') return [];
        const parts = name.split(/\s+/u).filter((part) => part.length >= 3);
        return [name, ...parts.filter((part) => !place.has(part.toLowerCase()))];
      });
    });
  };
}
