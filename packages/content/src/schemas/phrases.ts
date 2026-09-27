/**
 * `phrases` release items: phrase cards per destination language (greetings, help, emergency,
 * food, allergy, transport, politeness) with text, English gloss, romanisation and TTS audio.
 * Emergency and allergy cards publish only after a native speaker has reviewed them; a card with
 * no audio yet ships text-only with `audio_status: pending` and gets audio on the next TTS run.
 */
import { z } from 'zod';

import { isoDateSchema, languageTagSchema, slugSchema } from './common';

export const PHRASE_CONTEXTS = [
  'greetings',
  'politeness',
  'help',
  'emergency',
  'food',
  'allergy',
  'transport',
] as const;
export const phraseContextSchema = z.enum(PHRASE_CONTEXTS);
export type PhraseContext = z.infer<typeof phraseContextSchema>;

/** Contexts a native speaker must review before a card can publish. */
export const NATIVE_REVIEW_CONTEXTS: ReadonlySet<PhraseContext> = new Set(['emergency', 'allergy']);

export const phraseCardItemSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z-]+:[a-z]+:[a-z0-9-]+$/u, 'must be <language>:<context>:<slug>'),
    language: languageTagSchema,
    context: phraseContextSchema,
    slug: slugSchema,
    /** The phrase in the destination language and script. */
    text: z.string().min(1).max(160),
    /** Latin-script reading for non-Latin scripts; null when the text is already Latin. */
    romanisation: z.string().min(1).max(200).nullable(),
    /** English meaning, shown in quotes under the phrase. */
    gloss: z.string().min(1).max(160),
    audio_key: z.string().min(1).nullable(),
    audio_status: z.enum(['ready', 'pending']),
    needs_native_review: z.boolean(),
    native_reviewed_on: isoDateSchema.nullable(),
  })
  .strict()
  .superRefine((card, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (card.id !== `${card.language}:${card.context}:${card.slug}`)
      issue('id must be <language>:<context>:<slug>');
    if (NATIVE_REVIEW_CONTEXTS.has(card.context) && !card.needs_native_review) {
      issue(`${card.context} cards need native review`);
    }
    if ((card.audio_status === 'ready') !== (card.audio_key !== null)) {
      issue('audio_status is ready exactly when audio_key is set');
    }
  });
export type PhraseCardItem = z.infer<typeof phraseCardItemSchema>;

/** A card may publish once any review it needs has happened. */
export function isPhraseCardPublishable(card: PhraseCardItem): boolean {
  return !card.needs_native_review || card.native_reviewed_on !== null;
}
