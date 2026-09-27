/**
 * Phrase cards per destination language: the primary language of every one of the 61 places, one
 * generation unit per language covering every context (greetings, politeness, help, emergency,
 * food, allergy, transport). Emergency and allergy cards always carry the native-review flag.
 */
import {
  NATIVE_REVIEW_CONTEXTS,
  PHRASE_CONTEXTS,
  phraseCardItemSchema,
  type ContentItem,
} from '@cp/content';
import { z } from 'zod';

import { PLACE_FACTS } from '../../data/place-facts';
import type { Brief, GenerationUnit, Prompt } from '../types';

export interface PhraseUnitInput {
  readonly language: string;
  readonly script: string;
  readonly places: readonly string[];
}

/** Primary language of each place, with the script visitors see it written in. */
export function phraseLanguages(): PhraseUnitInput[] {
  const byLanguage = new Map<string, { script: string; places: string[] }>();
  for (const [code, facts] of Object.entries(PLACE_FACTS)) {
    const language = facts.languages[0];
    if (language === undefined) continue;
    const script = language === 'en' || language === 'ms' ? 'Latn' : facts.script;
    const entry = byLanguage.get(language) ?? { script, places: [] };
    entry.places.push(code);
    byLanguage.set(language, entry);
  }
  return [...byLanguage].map(([language, entry]) => ({
    language,
    script: entry.script,
    places: entry.places,
  }));
}

export function phrasesBrief(options: Readonly<Record<string, string>>): Brief {
  const wanted = options['languages']?.split(',');
  const units: GenerationUnit[] = phraseLanguages()
    .filter((l) => wanted === undefined || wanted.includes(l.language))
    .map((input) => ({ id: input.language, input }));
  return { units };
}

export const phraseOutputSchema = z.object({
  cards: z.array(
    z.object({
      context: z.enum(PHRASE_CONTEXTS),
      slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
      text: z.string().min(1).max(160),
      romanisation: z.string().min(1).max(200).nullable(),
      gloss: z.string().min(1).max(160),
    }),
  ),
});
export type PhraseOutput = z.infer<typeof phraseOutputSchema>;

const SYSTEM = `You write phrase cards for travellers: short phrases they show or play to a local. Use the natural, polite everyday form a native speaker would use, in the language's standard script.
Contexts (write 4-6 cards for each): greetings, politeness, help (asking for directions or help), emergency (doctor, ambulance, police, "call an ambulance", "I'm hurt"), food (ordering, "the bill please"), allergy (nuts, shellfish, gluten, dairy, "I have a severe allergy"), transport (taxi address, "stop here", "how much is the fare").
For each card: context, slug (short English kebab-case), text (in the language), romanisation (Latin-script reading when the script is not Latin, otherwise null), gloss (English meaning).
Reply with JSON only.`;

export function phrasesPrompt(unit: GenerationUnit, brief: Brief): Prompt {
  const input = unit.input as PhraseUnitInput;
  const notes = brief.notes?.['*'];
  return {
    system: SYSTEM,
    user: `Language: ${input.language} (script ${input.script}; spoken in ${input.places.join(', ').toUpperCase()}).${notes ? `\nReviewer notes: ${notes}` : ''}\nReturn {"cards": [...]}.`,
    schema: phraseOutputSchema,
    jsonSchema: {
      type: 'object',
      properties: {
        cards: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              context: { type: 'string', enum: [...PHRASE_CONTEXTS] },
              slug: { type: 'string' },
              text: { type: 'string' },
              romanisation: { type: ['string', 'null'] },
              gloss: { type: 'string' },
            },
            required: ['context', 'slug', 'text', 'romanisation', 'gloss'],
            additionalProperties: false,
          },
        },
      },
      required: ['cards'],
      additionalProperties: false,
    },
  };
}

export function toCards(language: string, output: PhraseOutput): ContentItem<'phrases'>[] {
  const seen = new Set<string>();
  return output.cards.flatMap((card) => {
    const id = `${language}:${card.context}:${card.slug}`;
    if (seen.has(id)) return [];
    seen.add(id);
    const parsed = phraseCardItemSchema.safeParse({
      id,
      language,
      context: card.context,
      slug: card.slug,
      text: card.text,
      romanisation: card.romanisation,
      gloss: card.gloss,
      audio_key: null,
      audio_status: 'pending',
      needs_native_review: NATIVE_REVIEW_CONTEXTS.has(card.context),
      native_reviewed_on: null,
    });
    return parsed.success ? [parsed.data] : [];
  });
}
