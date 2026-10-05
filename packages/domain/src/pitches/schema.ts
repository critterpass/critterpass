/**
 * The guide pitch (3b-3) on the wire and at rest: the facts its tools return (the only source of
 * every number it may show), the sections it streams (`POST /v1/pitches`, docs/api-contracts.md
 * §5.3) and the shape stored in `pitches.sections` for the cache. Chips and alternatives are built
 * by code from the facts; the model writes the headline, the reasons and the guide's quote.
 */
import { z } from 'zod';

export const PITCH_HEADLINE_MAX = 60;
export const PITCH_REASON_MAX = 90;
export const PITCH_QUOTE_MAX = 110;
export const PITCH_MAX_REASONS = 3;
export const PITCH_MAX_ALTERNATIVES = 2;

/** `get_fare_calendar`: the freshest fare per crew home airport for the pitched month. */
export const pitchFareSchema = z.object({
  origin: z.string().length(3),
  /** How many crewmates fly from this airport. */
  members: z.int().positive(),
  price_minor: z.int().nonnegative(),
  currency: z.string().length(3),
  duration_min: z.int().positive().nullable(),
  transfers: z.int().nonnegative().nullable(),
  seen_at: z.string().nullable(),
});
export type PitchFare = z.infer<typeof pitchFareSchema>;

/** `get_season_events`: dated events in or near the month, and the quietest good months. */
export const pitchSeasonSchema = z.object({
  best_months: z.array(z.int().min(1).max(12)).max(3),
  events: z
    .array(z.object({ name: z.string().max(60), kind: z.string(), starts_on: z.iso.date() }))
    .max(3),
});

/** `get_crew_taste_tags`: crew-visible taste tags and who carries them (never budgets). */
export const pitchTasteSchema = z.object({ tag: z.string(), member_ids: z.array(z.uuid()) });

/** `suggest_alternatives`: curated places to try instead. */
export const pitchAlternativeSchema = z.object({
  place_id: z.uuid(),
  name: z.string(),
  kind: z.enum(['cheaper', 'nearby']),
  /** How much less it costs each, for `cheaper`. */
  delta_minor: z.int().positive().nullable(),
  currency: z.string().length(3).nullable(),
});
export type PitchAlternative = z.infer<typeof pitchAlternativeSchema>;

export const pitchFactsSchema = z.object({
  place: z.object({
    id: z.uuid(),
    name: z.string(),
    country: z.string().nullable(),
    coverage: z.enum(['live', 'guest']),
    guide: z.string(),
  }),
  crew: z.object({ name: z.string(), size: z.int().positive() }),
  month: z.int().min(1).max(12).nullable(),
  fares: z.array(pitchFareSchema),
  season: pitchSeasonSchema,
  taste: z.array(pitchTasteSchema),
  alternatives: z.array(pitchAlternativeSchema).max(PITCH_MAX_ALTERNATIVES),
});
export type PitchFacts = z.infer<typeof pitchFactsSchema>;

export const pitchChipSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('price'),
    amount_minor: z.int(),
    currency: z.string(),
    origin: z.string(),
  }),
  z.object({ kind: z.literal('flight'), minutes: z.int().positive(), origin: z.string() }),
  z.object({ kind: z.literal('best_months'), months: z.array(z.int().min(1).max(12)).min(1) }),
  z.object({ kind: z.literal('event'), name: z.string(), starts_on: z.iso.date() }),
  z.object({ kind: z.literal('prices_pending') }),
]);
export type PitchChip = z.infer<typeof pitchChipSchema>;

export const pitchReasonSchema = z.object({
  text: z.string().min(1).max(PITCH_REASON_MAX),
  tag: z.string().nullable(),
  member_ids: z.array(z.uuid()),
});
export type PitchReason = z.infer<typeof pitchReasonSchema>;

export const pitchStickerSchema = z.object({
  place_id: z.uuid(),
  name: z.string(),
  country: z.string().nullable(),
  coverage: z.enum(['live', 'guest']),
  guide: z.string(),
});

/** `pitches.sections`: everything a cached pitch replays. */
export const pitchSectionsSchema = z.object({
  sticker: pitchStickerSchema,
  headline: z.string().max(PITCH_HEADLINE_MAX).nullable(),
  chips: z.array(pitchChipSchema),
  reasons: z.array(pitchReasonSchema).max(PITCH_MAX_REASONS),
  quote: z.string().max(PITCH_QUOTE_MAX).nullable(),
  alternatives: z.array(pitchAlternativeSchema),
});
export type PitchSections = z.infer<typeof pitchSectionsSchema>;

export const pitchRequestSchema = z.strictObject({
  crew_id: z.uuid(),
  place_id: z.uuid(),
  month: z.int().min(1).max(12).optional(),
});
export type PitchRequest = z.infer<typeof pitchRequestSchema>;

/** One SSE frame of `POST /v1/pitches`, in stream order. */
export type PitchStreamEvent =
  | ({ readonly type: 'sticker' } & z.infer<typeof pitchStickerSchema>)
  | { readonly type: 'headline'; readonly text: string }
  | ({ readonly type: 'chip' } & PitchChip)
  | ({ readonly type: 'reason' } & PitchReason)
  | { readonly type: 'quote'; readonly text: string }
  | ({ readonly type: 'alternative' } & PitchAlternative)
  | {
      readonly type: 'done';
      readonly pitch_id: string;
      readonly cached: boolean;
      /** EU AI Act Art. 50: guide output is marked as AI-generated. */
      readonly ai_generated: boolean;
    }
  | { readonly type: 'error'; readonly code: string; readonly retryable: boolean }
  /**
   * Nothing to show yet, the guide is still at it: sent while lines are held back (to be said in
   * the reader's language first), so a client that gives up on a silent stream keeps waiting.
   */
  | { readonly type: 'working' };

/** The code-built chips: price each for the majority origin, flight time, best months, an event. */
export function pitchChips(facts: PitchFacts): PitchChip[] {
  const chips: PitchChip[] = [];
  const main = [...facts.fares].sort(
    (a, b) => b.members - a.members || a.price_minor - b.price_minor,
  )[0];
  if (main === undefined) chips.push({ kind: 'prices_pending' });
  else {
    chips.push({
      kind: 'price',
      amount_minor: main.price_minor,
      currency: main.currency,
      origin: main.origin,
    });
    if (main.duration_min !== null)
      chips.push({ kind: 'flight', minutes: main.duration_min, origin: main.origin });
  }
  if (facts.season.best_months.length > 0)
    chips.push({ kind: 'best_months', months: facts.season.best_months.slice(0, 2) });
  const event = facts.season.events[0];
  if (event !== undefined)
    chips.push({ kind: 'event', name: event.name, starts_on: event.starts_on });
  return chips;
}

/** A validated model line (headline, reason with its taste tag, or the guide's quote). */
export type PitchLine =
  | { readonly s: 'headline'; readonly text: string }
  | { readonly s: 'reason'; readonly text: string; readonly tag: string | null }
  | { readonly s: 'quote'; readonly text: string };

/** Everything a pitch stores and replays: the tools' sticker, chips and alternatives, the lines. */
export function buildPitchSections(facts: PitchFacts, lines: readonly PitchLine[]): PitchSections {
  const taste = new Map(facts.taste.map((t) => [t.tag, t.member_ids]));
  return {
    sticker: {
      place_id: facts.place.id,
      name: facts.place.name,
      country: facts.place.country,
      coverage: facts.place.coverage,
      guide: facts.place.guide,
    },
    headline: lines.find((line) => line.s === 'headline')?.text ?? null,
    chips: pitchChips(facts),
    reasons: lines.flatMap((line) =>
      line.s === 'reason'
        ? [
            {
              text: line.text,
              tag: line.tag,
              member_ids: line.tag === null ? [] : (taste.get(line.tag) ?? []),
            },
          ]
        : [],
    ),
    quote: lines.find((line) => line.s === 'quote')?.text ?? null,
    alternatives: facts.alternatives,
  };
}
