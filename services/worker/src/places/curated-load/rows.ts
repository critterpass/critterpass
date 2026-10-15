/**
 * The curated places files (`places/<slug>.jsonl`, one place a line), written by researchers for a
 * destination's most visited places, and the note each line becomes. A line is checked as the
 * researchers' checker checks it; a line that fails is reported and left out, never half-loaded.
 * Fees and hours keep how they are known: `cited` with the page they were read on, otherwise an
 * estimate. The busy line is always an estimate.
 *
 * A second version of the file adds what the planner lays out days with: the place's area, its
 * times of day, busy windows, taste tags, how known it is, its rank among a first visit's
 * essentials, whether it works in the rain, how many itinerary pages include it, what a place to
 * eat serves, and the places it pairs with. Each is optional, so a first-version line still loads.
 */
import {
  busyWindowSchema,
  CURATED_PROMINENCE,
  curatedNoteSchema,
  MAX_BUSY_WINDOWS,
  PLACE_BEST_TIMES,
  POI_CATEGORIES,
  TASTE_TAGS,
  type CuratedFact,
  type CuratedNote,
  type CuratedPair,
  type EditorialText,
} from '@cp/domain';
import { z } from 'zod';

const line = (max: number) => z.string().trim().min(1).max(max);
const url = z.string().regex(/^https?:\/\//u);

const factSchema = z.object({
  text: line(160),
  source_url: url.nullable().optional(),
  estimate: z.boolean(),
});

export const curatedPlaceRowSchema = z
  .object({
    destination: z.string().min(1),
    name_en: line(200),
    name_local: z.string().trim().min(1).nullable().optional(),
    category: z.enum(POI_CATEGORIES),
    subtype: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    why_go_en: line(200),
    why_go_vi: line(200),
    visit_minutes: z.number().int().min(10).max(720),
    best_time: line(120),
    busy: line(160),
    entry_fee: factSchema,
    hours: factSchema,
    tips_en: z.array(line(140)).min(1).max(3),
    tips_vi: z.array(line(140)).min(1).max(3),
    dress: z.string().trim().max(160).nullable().optional(),
    getting_there: line(200),
    sources: z.array(url).min(1),
    area: line(80).optional(),
    best_times: z.array(z.enum(PLACE_BEST_TIMES)).min(1).max(3).optional(),
    busy_windows: z.array(busyWindowSchema).max(MAX_BUSY_WINDOWS).optional(),
    tags: z.array(z.enum(TASTE_TAGS)).min(1).max(4).optional(),
    prominence: z.enum(CURATED_PROMINENCE).optional(),
    essential_rank: z.number().int().min(1).max(8).nullable().optional(),
    indoor: z.boolean().optional(),
    blog_count: z.number().int().min(0).optional(),
    meal_role: z.enum(['meal', 'light']).optional(),
    dish: line(80).optional(),
    pairs_with: z.array(line(200)).max(3).optional(),
  })
  .refine((row) => row.tips_en.length === row.tips_vi.length, {
    message: 'tips_en and tips_vi hold the same tips',
    path: ['tips_vi'],
  })
  .refine((row) => row.entry_fee.estimate || typeof row.entry_fee.source_url === 'string', {
    message: 'a confirmed fee names the page it was read on',
    path: ['entry_fee'],
  })
  .refine((row) => row.hours.estimate || typeof row.hours.source_url === 'string', {
    message: 'confirmed hours name the page they were read on',
    path: ['hours'],
  });

export type CuratedPlaceRow = z.infer<typeof curatedPlaceRowSchema>;

function fact(input: CuratedPlaceRow['entry_fee']): CuratedFact {
  const source = input.source_url ?? null;
  // A fact is cited only with the page it was read on; anything else is shown as an estimate.
  return !input.estimate && source !== null
    ? { text: input.text, basis: 'cited', source_url: source }
    : { text: input.text, basis: 'estimate', ...(source === null ? {} : { source_url: source }) };
}

/** The note's lines a curated place sets (English) and its Vietnamese lines. */
export interface CuratedNoteLines {
  readonly lines: {
    readonly why_go: string;
    readonly best_time: string;
    readonly crowd_hint: string;
    readonly time_needed_min: number;
    readonly tips: readonly string[];
    readonly curated: CuratedNote;
    /** Set with an essential rank: one of the places a first visit is built around. */
    readonly must_see?: true;
    readonly essential?: true;
  };
  readonly vi: Pick<EditorialText, 'why_go' | 'tips'>;
}

/** A name in the one form the researchers' checker compares names in. */
export const curatedNameKey = (name: string) => name.trim().toLowerCase();

/**
 * What one curated line writes into its place's note; `rank` is its order in the file, and
 * `placed` the rows the file's other lines were matched to (by `curatedNameKey`), so a place it
 * pairs with carries that row's id.
 */
export function curatedNoteLines(
  row: CuratedPlaceRow,
  rank: number,
  placed: ReadonlyMap<string, string> = new Map(),
): CuratedNoteLines {
  const dress = row.dress?.trim() ?? '';
  const essentialRank = row.essential_rank ?? undefined;
  const pairs = (row.pairs_with ?? []).map((name): CuratedPair => {
    const poiId = placed.get(curatedNameKey(name));
    return poiId === undefined ? { name } : { name, poi_id: poiId };
  });
  const curated = curatedNoteSchema.parse({
    rank,
    fee: fact(row.entry_fee),
    hours: fact(row.hours),
    crowd_basis: 'estimate',
    ...(dress === '' ? {} : { dress }),
    getting_there: row.getting_there,
    sources: [...new Set(row.sources)].slice(0, 8),
    ...(row.best_times === undefined ? {} : { best_times: [...new Set(row.best_times)] }),
    ...(row.meal_role === undefined ? {} : { meal_role: row.meal_role }),
    ...(row.dish === undefined ? {} : { dish: row.dish }),
    ...(essentialRank === undefined ? {} : { essential_rank: essentialRank }),
    ...(row.tags === undefined ? {} : { tags: [...new Set(row.tags)] }),
    ...(row.area === undefined ? {} : { area: row.area }),
    ...(row.prominence === undefined ? {} : { prominence: row.prominence }),
    ...(row.indoor === undefined ? {} : { indoor: row.indoor }),
    ...(row.blog_count === undefined ? {} : { blog_count: row.blog_count }),
    ...(pairs.length === 0 ? {} : { pairs_with: pairs }),
  });
  return {
    lines: {
      why_go: row.why_go_en,
      best_time: row.best_time,
      crowd_hint: row.busy,
      time_needed_min: row.visit_minutes,
      tips: row.tips_en,
      curated,
      ...(essentialRank === undefined ? {} : { must_see: true, essential: true }),
    },
    vi: { why_go: row.why_go_vi, tips: row.tips_vi },
  };
}
