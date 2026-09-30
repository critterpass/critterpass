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

export async function readPlan(
  read: RunAsGuideReader,
  context: ToolContext,
  day: number | undefined,
) {
  return read(context.uid, tripOf(context), async (tx) => {
    const { rows } = await tx.query<PlanRow>(
      `SELECT version_id, day_no, date::text AS date, stable_id,
              coalesce(poi_name, notes, category, 'Plan item') AS title,
              poi_id, starts_at, ends_at, category
         FROM llm.plan_items
        WHERE visibility = 'crew' AND ($1::int IS NULL OR day_no = $1)
        ORDER BY day_no, starts_at NULLS LAST, stable_id`,
      [day ?? null],
    );
    const version = rows[0]?.version_id;
    if (version === undefined) throw new Error('the trip has no crew plan yet');
    const days = new Map<number, PlanDay>();
    for (const row of rows) {
      const entry = days.get(row.day_no) ?? { day_no: row.day_no, date: row.date, items: [] };
      entry.items.push({
        item_id: row.stable_id,
        title: row.title,
        poi_id: row.poi_id,
        starts_at: row.starts_at?.toISOString() ?? null,
        ends_at: row.ends_at?.toISOString() ?? null,
        category: row.category,
      });
      days.set(row.day_no, entry);
    }
    return { version, days: [...days.values()] };
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
