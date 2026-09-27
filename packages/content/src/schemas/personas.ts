/**
 * `personas` release items: the six guides' packs and the guest guide. `pack` is the guide
 * persona pack (voice, lexicon, local words, chattiness, colour, voice settings); its full shape is
 * owned by the AI package, which reads content releases, so the content factory validates `pack`
 * against that schema before a batch reaches review. This envelope pins what the catalogue needs:
 * which persona, and the prompt fixtures the persona eval suite runs.
 */
import { z } from 'zod';

export const PERSONA_KEYS = ['tokek', 'pon', 'lundi', 'ajo', 'sardi', 'paco', 'guest'] as const;
export const personaKeySchema = z.enum(PERSONA_KEYS);

export const personaFixtureSchema = z
  .object({
    prompt: z.string().min(1),
    /** Phrases a good answer contains (case-insensitive). */
    expect_any: z.array(z.string().min(1)),
    /** Phrases it must never contain. */
    forbid: z.array(z.string().min(1)),
  })
  .strict();

export const personaItemSchema = z
  .object({
    id: personaKeySchema,
    pack: z.record(z.string(), z.unknown()),
    /** The AI disclosure line shown wherever the persona speaks. */
    ai_disclosure: z.string().min(1),
    fixtures: z.array(personaFixtureSchema).min(1),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.pack['id'] !== item.id) {
      ctx.addIssue({ code: 'custom', message: 'pack.id must match the item id' });
    }
  });
export type PersonaItem = z.infer<typeof personaItemSchema>;
