/**
 * The drafting replies: what the guide may say back, as JSON keyed by our own ids. The guide
 * chooses and orders places and writes words; it never gives a time, a duration or a price (the
 * planner computes those), so no reply field holds one. `proseProblem` is the check every piece
 * of prose passes before it reaches a crew: no digits (numbers come from code), no links.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { WISH_TIMES } from '@cp/planner';
import { z } from 'zod';

const id = z.string().min(1).max(64);
/** Over-long prose is kept here and rejected by the caller (a too-long line never reaches a crew). */
const line = () => z.string().trim().min(1).max(600);

export const skeletonReplySchema = z.object({
  stay_area: line(),
  days: z
    .array(
      z.object({
        day_no: z.number().int().positive(),
        theme: line(),
        area: line(),
        must_do_ids: z.array(id).max(12),
        poi_ids: z.array(id).max(12),
      }),
    )
    .min(1),
  // Answers to the must-dos members typed by hand, read one by one in ./wish-answers.ts: a reply
  // without the list, or with entries that do not hold up, still gives a draft.
  wishes: z.array(z.unknown()).catch([]),
});
export type SkeletonReply = z.infer<typeof skeletonReplySchema>;

/**
 * One wish answer as the reply gave it. Only the wish it answers is required: any other field that
 * does not hold up is read as empty (no place, no day, any time, any weekday).
 */
export const wishAnswerReplySchema = z.object({
  wish_id: id,
  poi_id: z.string().nullable().catch(null),
  day_no: z.number().int().nullable().catch(null),
  when: z.string().catch('any'),
  weekdays: z.array(z.unknown()).catch([]),
});

export const stopReplySchema = z.object({
  poi_id: id,
  kind: z.string().optional(),
  must_do_id: id.nullable().optional(),
  note: z.string().trim().max(600).nullable().optional(),
});
export type StopReply = z.infer<typeof stopReplySchema>;

export const dayReplySchema = z.object({ stops: z.array(stopReplySchema).max(12) });
export type DayReply = z.infer<typeof dayReplySchema>;

export const redraftReplySchema = z.object({
  title: line(),
  summary: line(),
  stops: z.array(stopReplySchema).max(12),
});
export type RedraftReply = z.infer<typeof redraftReplySchema>;

const STOP_JSON = {
  type: 'object',
  additionalProperties: false,
  required: ['poi_id', 'kind', 'must_do_id', 'note'],
  properties: {
    poi_id: { type: 'string' },
    kind: { type: 'string', enum: ['activity', 'meal'] },
    must_do_id: { type: ['string', 'null'] },
    note: { type: 'string', maxLength: 140 },
  },
} as const;

export const SKELETON_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['stay_area', 'days', 'wishes'],
    properties: {
      stay_area: { type: 'string', maxLength: 60 },
      wishes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['wish_id', 'poi_id', 'day_no', 'when', 'weekdays'],
          properties: {
            wish_id: { type: 'string' },
            poi_id: { type: ['string', 'null'] },
            day_no: { type: ['integer', 'null'] },
            when: { type: 'string', enum: [...WISH_TIMES] },
            weekdays: {
              type: 'array',
              items: { type: 'string', enum: ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] },
            },
          },
        },
      },
      days: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['day_no', 'theme', 'area', 'must_do_ids', 'poi_ids'],
          properties: {
            day_no: { type: 'integer' },
            theme: { type: 'string', maxLength: 40 },
            area: { type: 'string', maxLength: 40 },
            must_do_ids: { type: 'array', items: { type: 'string' } },
            poi_ids: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  },
};

export const DAY_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['stops'],
    properties: { stops: { type: 'array', items: STOP_JSON } },
  },
};

export const REDRAFT_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'summary', 'stops'],
    properties: {
      title: { type: 'string', maxLength: 40 },
      summary: { type: 'string', maxLength: 160 },
      stops: { type: 'array', items: STOP_JSON },
    },
  },
};

const LINK = /https?:|www\.|\.[a-z]{2,6}\//iu;

const PHRASES = new Map<string, readonly string[]>();

/** A name's phrases with a digit: the whole name, and the word-and-number it is known by. */
function numberedPhrases(name: string): readonly string[] {
  const known = PHRASES.get(name);
  if (known !== undefined) return known;
  // "Tram 28" of "Tram 28 ride".
  const phrases = [name, ...(name.match(/(?:\S+\s+)?\S*\p{Nd}\S*/gu) ?? [])]
    .filter((phrase) => /\p{Nd}/u.test(phrase))
    .map((phrase) => phrase.toLowerCase());
  PHRASES.set(name, phrases);
  return phrases;
}

/**
 * Why a piece of prose may not reach the crew, or null when it may. Digits inside the name of a
 * place we know (`Tram 28`) are the name, not a claim; any other digit is.
 */
export function proseProblem(
  text: string,
  max = 200,
  names: readonly string[] = [],
): 'digits' | 'link' | 'length' | null {
  if (text.length > max) return 'length';
  let rest = text.toLowerCase();
  // Only a text with a digit has a number to excuse.
  if (!/\p{Nd}/u.test(rest)) return LINK.test(text) ? 'link' : null;
  for (const name of names) {
    for (const phrase of numberedPhrases(name)) rest = rest.replaceAll(phrase, ' ');
  }
  if (/\p{Nd}/u.test(rest)) return 'digits';
  if (LINK.test(text)) return 'link';
  return null;
}
