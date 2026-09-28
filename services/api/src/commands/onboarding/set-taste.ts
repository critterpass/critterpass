/**
 * `set_taste` (docs/api-contracts.md §4.1): the this-or-that answers (quiz or chips) become the
 * caller's taste tags, chronotype and pace. The answers are re-derived on the server from the
 * bundled quiz, so a client can never write a tag no answer produces. Retakes overwrite; tags stay
 * crew-visible unless the owner hides them (`user_settings.hide_taste_tags`).
 */
import { onboardingQuiz } from '@cp/content/onboarding';
import { appendDomainEvent } from '@cp/db';
import {
  normalizeAnswers,
  setTastePayloadSchema,
  tasteFromAnswers,
  type TagSource,
  type TasteAnswer,
} from '@cp/domain';
import type pg from 'pg';

import { defineCommand } from '../_framework/define-command';
import { announceMemberUpdated } from './member-updated';

export interface TasteWriteResult {
  readonly tags: readonly string[];
}

/** Upserts the caller's taste profile from `answers`; used by `set_taste` and `issue_pass`. */
export async function writeTasteProfile(
  tx: pg.PoolClient,
  uid: string,
  answers: readonly TasteAnswer[],
  source: Extract<TagSource, 'quiz' | 'chips'>,
): Promise<TasteWriteResult> {
  const quiz = onboardingQuiz();
  const kept = normalizeAnswers(quiz, answers);
  const taste = tasteFromAnswers(quiz, kept, source);
  await tx.query(
    `INSERT INTO taste_profiles (user_id, answers, tags, tag_sources, chronotype, pace)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       answers = EXCLUDED.answers, tags = EXCLUDED.tags, tag_sources = EXCLUDED.tag_sources,
       chronotype = EXCLUDED.chronotype, pace = EXCLUDED.pace`,
    [
      uid,
      JSON.stringify(kept),
      taste.tags,
      JSON.stringify(taste.tagSources),
      taste.chronotype,
      taste.pace,
    ],
  );
  return { tags: taste.tags };
}

export const setTasteCommand = defineCommand({
  name: 'set_taste',
  v: 1,
  schema: setTastePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx): Promise<TasteWriteResult> => {
    const written = await writeTasteProfile(tx, ctx.uid, payload.answers, payload.source);
    await appendDomainEvent(tx, {
      type: 'profile.taste_changed',
      aggregateKind: 'user',
      aggregateId: ctx.uid,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: { user_id: ctx.uid, source: payload.source },
    });
    await announceMemberUpdated(tx, ctx.uid, ['taste']);
    return written;
  },
});
