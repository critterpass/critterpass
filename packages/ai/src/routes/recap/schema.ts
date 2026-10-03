/**
 * The recap copy route's shapes (route `recap.narration`): the facts the worker computed, already
 * worded for display (amounts formatted, names first names only), and the reply: the guide's words
 * per story card and a title and line per award. Every number in the reply must be one the facts
 * hold (./number-guard.ts).
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { AwardKind, RecapCard } from '@cp/domain';
import { z } from 'zod';

import type { PersonaId } from '../../persona/schema';

/** One traveller's award as the guide sees it: who, which award, and the numbers behind it. */
export interface RecapCopyAward {
  readonly user_id: string;
  readonly name: string;
  readonly award: AwardKind;
  readonly metric: string;
  readonly value: number;
  /** Extra facts the line may use: earliest time, the place, share of the crew's total. */
  readonly evidence: Readonly<Record<string, string | number>>;
}

/** Everything the copy may say, computed by code; the model adds words, never facts. */
export interface RecapCopyFacts {
  readonly place: string;
  readonly crew: string | null;
  /** `2–4 Oct 2026`. */
  readonly dates: string;
  readonly days: number;
  readonly travellers: number;
  readonly people: readonly string[];
  readonly critters: { readonly forms_found: number; readonly new_critters: number };
  readonly route: {
    readonly km: number;
    /** True when the distances are straight-line estimates: the copy says "about". */
    readonly estimated: boolean;
    readonly stops: readonly string[];
    readonly longest_leg: {
      readonly from: string;
      readonly to: string;
      readonly km: number;
      readonly minutes: number;
    } | null;
    readonly driver: { readonly name: string; readonly km: number } | null;
    readonly before_sunrise: {
      readonly place: string;
      readonly time: string;
      readonly day: number;
    } | null;
  };
  readonly receipt: {
    readonly currency: string;
    readonly total: string;
    readonly each: string;
    readonly expenses: number;
    readonly meals: number;
    readonly planned_total: string | null;
    readonly under: string | null;
    readonly over: string | null;
    readonly priciest: { readonly what: string; readonly amount: string } | null;
    readonly cheapest_day: { readonly day: number; readonly each: string } | null;
    readonly settled: boolean;
    readonly still_owed: string | null;
    readonly settled_days_after_end: number | null;
  };
  readonly got_away: {
    readonly rarity: 'epic' | 'legendary';
    readonly sightings: number;
    readonly missed_by: readonly string[];
    readonly forms_found: number;
    readonly forms_total: number;
    /** `June` or `May to September`, when it only comes back in season. */
    readonly comes_back: string | null;
  } | null;
  readonly best_day: { readonly day: number; readonly date: string } | null;
}

export interface RecapCopyInput {
  readonly guide: PersonaId;
  /** The cards to write, in play order (no got-away card when nothing got away). */
  readonly cards: readonly RecapCard[];
  readonly facts: RecapCopyFacts;
  readonly awards: readonly RecapCopyAward[];
}

export const RECAP_AWARD_TITLE_MAX = 40;
export const RECAP_AWARD_LINE_MAX = 140;

/** Parsed loosely: lengths and missing words are the validator's to judge, card by card. */
export const recapCopyReplySchema = z.object({
  cards: z.record(
    z.string(),
    z.object({
      narration: z.string().optional(),
      headline: z.string().optional(),
      line: z.string().optional(),
    }),
  ),
  awards: z.array(z.object({ user_id: z.string(), title: z.string(), line: z.string() })),
});
export type RecapCopyReply = z.infer<typeof recapCopyReplySchema>;

export interface RecapAwardCopy {
  readonly user_id: string;
  readonly title: string;
  readonly line: string;
}

const cardCopy = {
  type: 'object',
  additionalProperties: false,
  required: ['narration'],
  properties: {
    narration: { type: 'string' },
    headline: { type: 'string' },
    line: { type: 'string' },
  },
} as const;

export const RECAP_COPY_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['cards', 'awards'],
    properties: {
      cards: { type: 'object', additionalProperties: cardCopy },
      awards: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['user_id', 'title', 'line'],
          properties: {
            user_id: { type: 'string' },
            title: { type: 'string' },
            line: { type: 'string' },
          },
        },
      },
    },
  },
};
