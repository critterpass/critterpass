/**
 * Persona pack shape. Every critter is the guide of its city, so a persona id is any guide slug
 * (or `guest`). The guides with a written pack keep it in `packages/ai/personas/*.json` as the
 * repo fallback and, once approved through the content pipeline, in `persona_packs`
 * (style / lexicon / voice_settings jsonb); every other guide speaks from a pack built from its
 * critter's facts (`./template`). Keys are snake_case in both places.
 */
import { guideFactsBySlug } from '@cp/critter-art/guides';
import { guideColourSchema, personaPackStatusSchema } from '@cp/domain';
import { z } from 'zod';

/** The guides with a pack written in this repo. */
export const GUIDE_SLUGS = ['tokek', 'pon', 'lundi', 'ajo', 'sardi', 'paco', 'chava'] as const;
export const PERSONA_IDS = [...GUIDE_SLUGS, 'guest'] as const;
export type WrittenPersonaId = (typeof PERSONA_IDS)[number];
/** A written pack's id, or the slug of any other critter's guide. */
export type PersonaId = WrittenPersonaId | (string & {});

export function isWrittenPersonaId(id: string): id is WrittenPersonaId {
  return (PERSONA_IDS as readonly string[]).includes(id);
}

export function isPersonaId(slug: string): boolean {
  return isWrittenPersonaId(slug) || guideFactsBySlug(slug) !== undefined;
}

/** Accepts the slug of any guide; a slug no critter folds to is refused. */
export const personaIdSchema: z.ZodType<PersonaId> = z
  .string()
  .refine(isPersonaId, { message: 'not a guide' });

export const CHATTINESS_LEVELS = ['quiet', 'normal', 'chatty'] as const;
export const chattinessLevelSchema = z.enum(CHATTINESS_LEVELS);
export type ChattinessLevel = z.infer<typeof chattinessLevelSchema>;

const scale = z.number().int().min(0).max(5);

export const localWordSchema = z.object({
  term: z.string().min(1),
  gloss: z.string().min(1),
  /** Pronunciation; null until a native speaker has vetted it. */
  ipa: z.string().min(1).nullable(),
  when: z.string().min(1),
  vetted: z.boolean(),
});
export type LocalWord = z.infer<typeof localWordSchema>;

export const chattinessSettingSchema = z.object({
  max_sentences: z.number().int().min(1).max(8),
  local_words_per_reply: z.number().int().min(0).max(3),
  proactive_per_day: z.number().int().min(0).max(10),
});
export type ChattinessSetting = z.infer<typeof chattinessSettingSchema>;

export const personaPackSchema = z
  .object({
    id: personaIdSchema,
    version: z.string().min(1),
    status: personaPackStatusSchema,
    name: z.string().min(1),
    species: z.string().min(1),
    /** `destinations.slug` of the guide's home; null for the guest guide. */
    destination: z.string().min(1).nullable(),
    colour: guideColourSchema,
    /** TTS voice; null until the owned voice is recorded. */
    voice_id: z.string().min(1).nullable(),
    register: z.object({ warmth: scale, humour: scale, dryness: scale }),
    tagline: z.string().min(1),
    catchphrases: z.array(z.string().min(1)),
    local_words: z.array(localWordSchema),
    taboos: z.array(z.string().min(1)),
    sign_off: z.string().min(1).nullable(),
    chattiness: z.object({
      quiet: chattinessSettingSchema,
      normal: chattinessSettingSchema,
      chatty: chattinessSettingSchema,
    }),
    guest_mode: z
      .object({
        base_guide: z.enum(GUIDE_SLUGS),
        hedge: z.string().min(1),
      })
      .nullable(),
    /**
     * Set on a guide nobody has written for yet: it is its city's own guide, still learning the
     * place, and frames what it shares with this hedge.
     */
    learning: z
      .object({ hedge: z.string().min(1) })
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((pack, ctx) => {
    const isGuest = pack.id === 'guest';
    if (isGuest !== (pack.guest_mode !== null)) {
      ctx.addIssue({ code: 'custom', message: 'guest_mode is set on the guest pack only' });
    }
    if (isGuest !== (pack.destination === null)) {
      ctx.addIssue({ code: 'custom', message: 'only the guest pack has no home destination' });
    }
  });
export type PersonaPack = z.infer<typeof personaPackSchema>;
