/**
 * The social kit as data: canvas templates (`templates/<id>.json`, the sizes and the platform's
 * keep-clear bands) and the sets rendered into them (`sets/<id>.json`). A set names critters by
 * their dex key; the name, the city and the colour come from the dex, so a post never disagrees
 * with the app. `tools/scripts/social-kit/render.ts` draws them.
 */
import { APP_LOCALES, type AppLocale } from '@cp/domain';
import { z } from 'zod';

import localOfTheWeek from './sets/local-of-the-week.json' with { type: 'json' };
import postSquare from './templates/post-square.json' with { type: 'json' };
import story from './templates/story.json' with { type: 'json' };

const locale = z.enum(APP_LOCALES);
const id = z.string().regex(/^[a-z][a-z0-9-]*$/u);

export const socialTemplateSchema = z.strictObject({
  id,
  width: z.int().positive(),
  height: z.int().positive(),
  /** Bands the platform covers with its own chrome (a story's header and reply bar). */
  safe: z.strictObject({ top: z.int().min(0), bottom: z.int().min(0) }),
});
export type SocialTemplate = z.infer<typeof socialTemplateSchema>;

const itemCopy = z.strictObject({
  line: z.string().trim().min(1).max(90),
  /** Read out by screen readers where the image is posted. */
  alt: z.string().trim().min(1).max(250),
});

export const socialSetSchema = z.strictObject({
  id,
  templates: z.array(id).min(1),
  eyebrow: z.partialRecord(locale, z.string().trim().min(1).max(32)),
  items: z
    .array(
      z.strictObject({
        critter: z.string().regex(/^cp-\d{3}$/u),
        seed: z.int().min(0),
        copy: z.partialRecord(locale, itemCopy),
      }),
    )
    .min(1),
});
export type SocialSet = z.infer<typeof socialSetSchema>;

export function socialTemplates(): SocialTemplate[] {
  return [postSquare, story].map((raw) => socialTemplateSchema.parse(raw));
}

export function socialSets(): SocialSet[] {
  return [localOfTheWeek].map((raw) => socialSetSchema.parse(raw));
}

/**
 * The languages a set renders in: those with its eyebrow and every item's copy. `requested`
 * narrows that; a language the set is not written in is an error, never a half-translated batch.
 */
export function socialSetLocales(set: SocialSet, requested?: readonly string[]): AppLocale[] {
  const written = APP_LOCALES.filter(
    (candidate) =>
      set.eyebrow[candidate] !== undefined &&
      set.items.every((item) => item.copy[candidate] !== undefined),
  );
  if (requested === undefined || requested.length === 0) return written;
  return requested.map((wanted) => {
    const found = written.find((candidate) => candidate === wanted);
    if (found === undefined) throw new Error(`${set.id} is not written in ${wanted}`);
    return found;
  });
}
