/**
 * Quest templates: what a crew quest can ask for. The guide proposes a template and its params; code
 * checks the params against the day (the POI is on today's plan, the category exists, the target is
 * inside the template's bounds, the XP inside its table) and counts progress from events, so the
 * model never sets a target, a progress value or an XP amount. Only templates whose events exist
 * are built in here; later features add theirs through the worker's template registry.
 */
import { z } from 'zod';

/** One plan item of the quest day, as the generator and the validator see it. */
export interface QuestPlanItem {
  /** The item's stable id (survives plan versions). */
  readonly id: string;
  readonly poi_id: string | null;
  readonly name: string;
  /** Local start time `HH:MM`, when the item has one. */
  readonly start: string | null;
  readonly category: string | null;
}

/** Everything a quest may refer to on one trip day. */
export interface QuestDay {
  /** Local date of the quest day, `YYYY-MM-DD`. */
  readonly localDate: string;
  readonly tz: string;
  /** Travellers on the trip today (RSVP in). */
  readonly travellers: number;
  /** At least one traveller shares visits (POI check-ins); visit templates need it. */
  readonly visitConsent: boolean;
  readonly items: readonly QuestPlanItem[];
  /** Expense categories a `log_expenses` quest may name. */
  readonly expenseCategories: readonly string[];
  /** Critter set codes of the trip's destination. */
  readonly critterSets: readonly string[];
  /** POI id → the legendary form a co-presence spawn there grants. */
  readonly copresenceForms: Readonly<Record<string, string>>;
  /** The trip still has something to settle. */
  readonly openBalance: boolean;
  readonly lastDay: boolean;
}

export interface QuestRewardExtras {
  /** A sticker the quest leads to (the Settled Tokek is still granted by settling up). */
  readonly sticker: 'settled' | null;
  /** A critter form the quest leads to (a co-presence legendary, granted by its spawn). */
  readonly form_id: string | null;
}

export interface QuestTemplateDef<P = Record<string, unknown>> {
  readonly id: string;
  /** One line telling the guide what the quest asks for and how its params read. */
  readonly summary: string;
  readonly params: z.ZodType<P>;
  /** Domain event types that can move this quest. */
  readonly consumes: readonly string[];
  /** What progress counts, stored on the quest. */
  readonly metric: string;
  /** XP the quest may pay, inclusive. */
  readonly xp: { readonly min: number; readonly max: number };
  /** Counted from visits (POI check-ins): left out when nobody shares visits. */
  readonly needsVisits: boolean;
  readonly minTravellers: number;
  target(params: P, day: QuestDay): number;
  /** Null when the params resolve against the day; otherwise why not. */
  resolve(params: P, day: QuestDay): string | null;
  /** The facts the guide's title and line may quote (every number must come from here). */
  facts(params: P, day: QuestDay): Readonly<Record<string, string | number>>;
  /** Local `HH:MM` after which the quest can no longer be done that day. */
  deadline(params: P): string | null;
  extras(params: P, day: QuestDay): QuestRewardExtras;
}

export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u);

const NO_EXTRAS: QuestRewardExtras = { sticker: null, form_id: null };

function itemAtPoi(day: QuestDay, poiId: string): QuestPlanItem | undefined {
  return day.items.find((item) => item.poi_id === poiId);
}

const minutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Deadlines before 03:00 (sunrise climbs start early) or after 23:30 are out of bounds. */
function deadlineInDay(time: string): boolean {
  return minutes(time) >= 3 * 60 && minutes(time) <= 23 * 60 + 30;
}

/** The names and plan times of the places a quest names: its copy may quote either. */
function placeFacts(day: QuestDay, poiIds: readonly string[]): Record<string, string> {
  const items = poiIds.map((id) => itemAtPoi(day, id));
  return {
    places: items.map((item) => item?.name ?? '').join(', '),
    starts: items.map((item) => item?.start ?? '').join(', '),
  };
}

function define<P>(def: QuestTemplateDef<P>): QuestTemplateDef<P> {
  return def;
}

export const visitPoiTemplate = define({
  id: 'visit_poi',
  summary: "Someone on the crew checks in at one place on today's plan (poi_id from the plan).",
  params: z.object({ poi_id: z.uuid() }).strict(),
  consumes: ['visit.recorded'],
  metric: 'visits',
  xp: { min: 40, max: 100 },
  needsVisits: true,
  minTravellers: 1,
  target: () => 1,
  resolve: (p, day) => (itemAtPoi(day, p.poi_id) ? null : 'poi_not_in_plan'),
  facts: (p, day) => placeFacts(day, [p.poi_id]),
  deadline: () => null,
  extras: () => NO_EXTRAS,
});

export const visitAnyOfTemplate = define({
  id: 'visit_any_of',
  summary: "The crew checks in at n different places from a list of today's plan places.",
  params: z
    .object({ poi_ids: z.array(z.uuid()).min(2).max(6), n: z.number().int().min(2).max(6) })
    .strict(),
  consumes: ['visit.recorded'],
  metric: 'distinct_places',
  xp: { min: 60, max: 150 },
  needsVisits: true,
  minTravellers: 1,
  target: (p) => p.n,
  resolve: (p, day) => {
    if (new Set(p.poi_ids).size !== p.poi_ids.length) return 'repeated_poi';
    if (p.n > p.poi_ids.length) return 'target_out_of_bounds';
    return p.poi_ids.every((id) => itemAtPoi(day, id)) ? null : 'poi_not_in_plan';
  },
  facts: (p, day) => ({ n: p.n, ...placeFacts(day, p.poi_ids) }),
  deadline: () => null,
  extras: () => NO_EXTRAS,
});

export const logExpensesTemplate = define({
  id: 'log_expenses',
  summary: 'The crew logs n expenses today, optionally in one category.',
  params: z
    .object({ category: z.string().min(1).max(40).optional(), n: z.number().int().min(1).max(8) })
    .strict(),
  consumes: ['expense.added'],
  metric: 'expenses',
  xp: { min: 30, max: 120 },
  needsVisits: false,
  minTravellers: 1,
  target: (p) => p.n,
  resolve: (p, day) =>
    p.category === undefined || day.expenseCategories.includes(p.category)
      ? null
      : 'unknown_category',
  facts: (p) => ({ n: p.n, ...(p.category === undefined ? {} : { category: p.category }) }),
  deadline: () => null,
  extras: () => NO_EXTRAS,
});

export const befriendTemplate = define({
  id: 'befriend',
  summary: 'The crew befriends n local critters today, optionally from one set.',
  params: z
    .object({ n: z.number().int().min(1).max(3), set: z.string().min(1).max(40).optional() })
    .strict(),
  consumes: ['critter.befriended'],
  metric: 'finds',
  xp: { min: 50, max: 150 },
  needsVisits: false,
  minTravellers: 1,
  target: (p) => p.n,
  resolve: (p, day) => {
    if (day.critterSets.length === 0) return 'no_critters_here';
    return p.set === undefined || day.critterSets.includes(p.set) ? null : 'unknown_set';
  },
  facts: (p) => ({ n: p.n }),
  deadline: () => null,
  extras: () => NO_EXTRAS,
});

export const copresenceTemplate = define({
  id: 'copresence',
  summary:
    'Every traveller checks in at one plan place by a local time (HH:MM, not before its plan time).',
  params: z.object({ poi_id: z.uuid(), by_time: localTimeSchema }).strict(),
  consumes: ['visit.recorded', 'copresence.completed'],
  metric: 'travellers_there',
  xp: { min: 80, max: 200 },
  needsVisits: true,
  minTravellers: 2,
  target: (_p, day) => day.travellers,
  resolve: (p, day) => {
    const item = itemAtPoi(day, p.poi_id);
    if (item === undefined) return 'poi_not_in_plan';
    if (!deadlineInDay(p.by_time)) return 'time_out_of_bounds';
    if (item.start !== null && minutes(p.by_time) < minutes(item.start)) return 'before_the_plan';
    return null;
  },
  facts: (p, day) => ({ time: p.by_time, ...placeFacts(day, [p.poi_id]) }),
  deadline: (p) => p.by_time,
  extras: (p, day) => ({ sticker: null, form_id: day.copresenceForms[p.poi_id] ?? null }),
});

export const settleByTemplate = define({
  id: 'settle_by',
  summary: 'The crew settles every balance by a local time (HH:MM) today.',
  params: z.object({ by_time: localTimeSchema }).strict(),
  consumes: ['trip.settled'],
  metric: 'settled',
  xp: { min: 80, max: 200 },
  needsVisits: false,
  minTravellers: 2,
  target: () => 1,
  resolve: (p, day) => {
    if (!day.openBalance) return 'nothing_to_settle';
    return deadlineInDay(p.by_time) ? null : 'time_out_of_bounds';
  },
  facts: (p) => ({ time: p.by_time }),
  deadline: (p) => p.by_time,
  extras: () => ({ sticker: 'settled', form_id: null }),
});

export const earlyStartTemplate = define({
  id: 'early_start',
  summary:
    "Someone checks in at a timed plan item's place by a local time up to two hours before it starts.",
  params: z.object({ plan_item_id: z.uuid(), by_time: localTimeSchema }).strict(),
  consumes: ['visit.recorded'],
  metric: 'early_visit',
  xp: { min: 40, max: 100 },
  needsVisits: true,
  minTravellers: 1,
  target: () => 1,
  resolve: (p, day) => {
    const item = day.items.find((candidate) => candidate.id === p.plan_item_id);
    if (item?.poi_id === null || item === undefined) return 'item_not_in_plan';
    if (!deadlineInDay(p.by_time)) return 'time_out_of_bounds';
    if (item.start === null) return 'item_has_no_time';
    const gap = minutes(item.start) - minutes(p.by_time);
    // "Be there before it starts": at most two hours early, never after it has begun.
    return gap >= 0 && gap <= 120 ? null : 'time_out_of_bounds';
  },
  facts: (p, day) => {
    const item = day.items.find((candidate) => candidate.id === p.plan_item_id);
    return { time: p.by_time, place: item?.name ?? '', starts: item?.start ?? '' };
  },
  deadline: (p) => p.by_time,
  extras: () => NO_EXTRAS,
});

/** The templates built in at launch, in the order the fallback prefers them. */
export const BUILTIN_QUEST_TEMPLATES: readonly QuestTemplateDef<never>[] = [
  earlyStartTemplate,
  visitPoiTemplate,
  visitAnyOfTemplate,
  copresenceTemplate,
  logExpensesTemplate,
  befriendTemplate,
  settleByTemplate,
] as unknown as readonly QuestTemplateDef<never>[];

export type QuestTemplateMap = ReadonlyMap<string, QuestTemplateDef<never>>;

export function templateMap(defs: readonly QuestTemplateDef<never>[]): QuestTemplateMap {
  return new Map(defs.map((def) => [def.id, def]));
}

/** The templates the day allows at all (visit consent, solo travellers). */
export function templatesForDay(templates: QuestTemplateMap, day: QuestDay): string[] {
  return [...templates.values()]
    .filter((def) => (!def.needsVisits || day.visitConsent) && day.travellers >= def.minTravellers)
    .map((def) => def.id);
}
