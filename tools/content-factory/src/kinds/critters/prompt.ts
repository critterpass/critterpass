/**
 * Critter prompt: per place, a neutral one-line dex note for each critter and, where the place
 * writes in a non-Latin script, the critter's name written natively. Names themselves stay as
 * designed; the model never renames a critter.
 */
import { z } from 'zod';

import type { Brief, GenerationUnit, Prompt } from '../types';
import type { CritterUnitInput } from './brief';

export const critterOutputSchema = z.object({
  critters: z.array(
    z.object({
      id: z.string(),
      note: z.string().min(1).max(140),
      name_native: z.string().min(1).max(24).nullable(),
    }),
  ),
});
export type CritterOutput = z.infer<typeof critterOutputSchema>;

const SYSTEM = `You write CritterDex notes for CritterPass, a travel app where people befriend local critters by visiting places.
Rules for every note:
- One sentence, at most 120 characters, plain and warm, present tense.
- About the animal's real habits or the place it lives in; true to the species and the city.
- Neutral narrator: no "I", no guide voice, no catchphrases, no emoji, no exclamation marks.
- Never include the critter's own name (it stays hidden until someone finds it).
- Never mention real people, brands, companies, sports teams, films or characters.
Native names: when the place writes in a non-Latin script, give the critter's name as a local reader would write it (a faithful transliteration of the given name, not a translation); otherwise null.
Reply with JSON only.`;

function noteFor(brief: Brief, ids: readonly string[]): string {
  const notes = brief.notes ?? {};
  const lines = [notes['*'], ...ids.map((id) => (notes[id] ? `${id}: ${notes[id]}` : undefined))];
  const present = lines.filter((line): line is string => line !== undefined);
  return present.length === 0
    ? ''
    : `\nReviewer notes from the last round:\n${present.join('\n')}\n`;
}

export function critterPrompt(unit: GenerationUnit, brief: Brief): Prompt {
  const input = unit.input as CritterUnitInput;
  const latin = input.script === 'Latn';
  const list = input.critters
    .map(
      (c) =>
        `- ${c.id}: ${c.name}, a ${c.species} from ${c.city}${c.guide ? ' (a live guide)' : ''}`,
    )
    .join('\n');
  return {
    system: SYSTEM,
    user: `Place: ${input.placeName} (languages: ${input.languages.join(', ')}; script: ${input.script}).
${input.placeBrief === null ? '' : `Place brief:\n${input.placeBrief}\n`}${noteFor(
      brief,
      input.critters.map((c) => c.id),
    )}
Critters:
${list}

Return {"critters": [{"id", "note", "name_native"}]} with one entry per critter, in the same order.${latin ? ' This place writes in Latin script, so name_native is null for every critter.' : ''}`,
    schema: critterOutputSchema,
    jsonSchema: {
      type: 'object',
      properties: {
        critters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              note: { type: 'string', maxLength: 140 },
              name_native: { type: ['string', 'null'] },
            },
            required: ['id', 'note', 'name_native'],
            additionalProperties: false,
          },
        },
      },
      required: ['critters'],
      additionalProperties: false,
    },
  };
}
