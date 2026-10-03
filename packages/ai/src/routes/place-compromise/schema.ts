/**
 * The `places.compromise` input and reply. Code builds the candidates (who goes, when, what it
 * costs); the guide picks two and words them. The reply names candidates by the ids given, so it
 * can only choose among options code already worked out.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { PlaceStance } from '@cp/domain';
import { z } from 'zod';

import type { PersonaId } from '../../persona/schema';

export const COMPROMISE_TITLE_MAX = 24;
export const COMPROMISE_BODY_MAX = 140;

export const COMPROMISE_KINDS = ['split_group', 'alternative', 'reschedule'] as const;
export type CompromiseKind = (typeof COMPROMISE_KINDS)[number];

export interface CompromiseCandidate {
  readonly id: string;
  readonly kind: CompromiseKind;
  /** The place this option goes to (the split place, or the alternative). */
  readonly placeName: string;
  /** The day as the screen writes it ("Sat 17"). */
  readonly day: string;
  /** HH:MM, local. */
  readonly startsAt: string;
  /** HH:MM back, when known. */
  readonly endsAt: string | null;
  /** First names of who goes; every name is a crew member's. */
  readonly attendees: readonly string[];
  /** The whole crew goes. */
  readonly everyone: boolean;
  readonly goingCount: number;
  /** One way by road, in minutes, when known. */
  readonly driveMinutes: number | null;
  /** The cost line as the screen writes it ("Rp 450k for the car"), when there is one. */
  readonly cost: string | null;
  /** Code-written facts the words may use ("a water palace", "no queue", "driver Made"). */
  readonly facts: readonly string[];
}

export interface CompromiseStance {
  readonly name: string;
  readonly stance: PlaceStance;
  /** What they wrote, as they wrote it; it reaches the model only as a crew message. */
  readonly note: string | null;
}

export interface PlaceCompromiseInput {
  readonly guide: PersonaId;
  /** The reader's app language; absent or `en`: English. */
  readonly locale?: string;
  /** The place the crew split on. */
  readonly placeName: string;
  readonly stances: readonly CompromiseStance[];
  /** First names of members who have not said. */
  readonly silent: readonly string[];
  readonly candidates: readonly CompromiseCandidate[];
}

export const PLACE_COMPROMISE_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['options'],
    properties: {
      options: {
        type: 'array',
        minItems: 2,
        maxItems: 2,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['candidate_id', 'title', 'body'],
          properties: {
            candidate_id: { type: 'string' },
            title: { type: 'string', maxLength: COMPROMISE_TITLE_MAX },
            body: { type: 'string', maxLength: COMPROMISE_BODY_MAX },
          },
        },
      },
    },
  },
};

export const placeCompromiseReplySchema = z.strictObject({
  options: z
    .array(z.strictObject({ candidate_id: z.string(), title: z.string(), body: z.string() }))
    .length(2),
});

export interface CompromiseOption {
  readonly candidateId: string;
  readonly title: string;
  readonly body: string;
}

/**
 * `ok`: the guide's two options. Otherwise the caller shows its templates for `fallbackIds` (the
 * first two candidates), so the screen never waits on the model.
 */
export type PlaceCompromiseResult =
  | { readonly ok: true; readonly options: readonly [CompromiseOption, CompromiseOption] }
  | { readonly ok: false; readonly reason: string; readonly fallbackIds: readonly string[] };
