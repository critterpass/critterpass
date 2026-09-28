/**
 * Phrase cards: generated per language, audio added when TTS is configured. One generation feeds
 * two batches: `--opt contexts=greetings,politeness,help,food,transport` publishes as soon as it
 * is approved, while `--opt contexts=emergency,allergy` stays blocked until a native speaker has
 * reviewed the cards (`--opt native_reviewed_on=YYYY-MM-DD` records that review).
 */
import { isPhraseCardPublishable } from '@cp/content';

import { registerKind } from '../registry';
import type { KindModule } from '../types';
import {
  phrasesBrief,
  phrasesPrompt,
  toCards,
  type PhraseOutput,
  type PhraseUnitInput,
} from './generate';
import { synthesise, ttsConfigFromEnv } from './tts';
import { phraseValidators } from './validate';

export const phrasesKind: KindModule<'phrases'> = {
  kind: 'phrases',
  title: (ctx) => `Phrase cards · ${ctx.options['languages'] ?? 'every destination language'}`,
  gate: 'native_review',
  brief: (ctx) => Promise.resolve(phrasesBrief(ctx.options)),
  prompt: phrasesPrompt,
  assemble: async (ctx, brief, outputs) => {
    const contexts = ctx.options['contexts']?.split(',');
    const reviewedOn = ctx.options['native_reviewed_on'] ?? null;
    const cards = brief.units
      .flatMap((unit) => {
        const output = outputs.get(unit.id) as PhraseOutput | undefined;
        return output === undefined
          ? []
          : toCards((unit.input as PhraseUnitInput).language, output);
      })
      .filter((card) => contexts === undefined || contexts.includes(card.context))
      .map((card) =>
        reviewedOn !== null && card.needs_native_review
          ? { ...card, native_reviewed_on: reviewedOn }
          : card,
      );
    return synthesise(cards, ttsConfigFromEnv());
  },
  validators: phraseValidators,
  blockedReason: (cards) => {
    const held = cards.filter((card) => !isPhraseCardPublishable(card)).length;
    return held === 0 ? null : `${held} emergency or allergy cards need a native speaker`;
  },
};

registerKind(phrasesKind);
