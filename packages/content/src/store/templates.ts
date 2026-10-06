/**
 * Store screenshot frames as data (`templates/<shot>.json`): the caption over each captured screen,
 * the frame's colours and its critter accent. A caption states what the captured screen does and
 * never a price. The capture flows (`e2e/store-shots`) and the compositor
 * (`tools/scripts/store-kit/compose.ts`) both go by the shot's id.
 */
import { APP_LOCALES, type AppLocale } from '@cp/domain';
import { z } from 'zod';

import critters from './templates/critters.json' with { type: 'json' };
import money from './templates/money.json' with { type: 'json' };
import plan from './templates/plan.json' with { type: 'json' };
import tripDay from './templates/trip-day.json' with { type: 'json' };
import vote from './templates/vote.json' with { type: 'json' };
import { storeCopy } from './schema';

/** Both stores take at most this many phone screenshots that every listing can show. */
export const STORE_SHOTS_MAX = 8;

const hex = z.string().regex(/^#[0-9a-f]{6}$/u);
const caption = z.strictObject({ headline: storeCopy(48), sub: storeCopy(80) });

export const shotTemplateSchema = z.strictObject({
  /** Names the capture (`store-<locale>-<id>.png`) and the composed file. */
  id: z.string().regex(/^[a-z][a-z0-9-]*$/u),
  /** Position in the listing, from 1. */
  order: z.int().min(1).max(STORE_SHOTS_MAX),
  background: hex,
  ink: hex,
  /** The critter sticker beside the device. */
  accent: z.strictObject({ kind: z.string().min(1), seed: z.int().min(0) }).optional(),
  caption: z
    .partialRecord(z.enum(APP_LOCALES), caption)
    .refine((captions) => captions.en !== undefined, 'the English caption is required'),
});
export type ShotTemplate = z.infer<typeof shotTemplateSchema>;

/** Parses a set of shot templates: listing order, with unique ids and positions. */
export function parseShotTemplates(raw: readonly unknown[]): ShotTemplate[] {
  const templates = raw.map((entry) => shotTemplateSchema.parse(entry));
  if (templates.length > STORE_SHOTS_MAX) {
    throw new Error(`at most ${String(STORE_SHOTS_MAX)} store shots`);
  }
  for (const key of ['id', 'order'] as const) {
    if (new Set(templates.map((template) => template[key])).size !== templates.length) {
      throw new Error(`store shots repeat an ${key}`);
    }
  }
  return templates.sort((a, b) => a.order - b.order);
}

/** Every store shot, in listing order. */
export function storeShotTemplates(): ShotTemplate[] {
  return parseShotTemplates([vote, critters, plan, tripDay, money]);
}

/**
 * The languages a set of store shots is made in. A language ships when it has a listing and every
 * shot has its caption; `requested` narrows that, and asking for one that does not ship is an
 * error rather than a set with English captions under another language's listing.
 */
export function shotLocales(
  templates: readonly ShotTemplate[],
  listed: readonly AppLocale[],
  requested?: readonly string[],
): AppLocale[] {
  const shipped = listed.filter((locale) =>
    templates.every((template) => template.caption[locale] !== undefined),
  );
  if (requested === undefined || requested.length === 0) return shipped;
  return requested.map((locale) => {
    const found = shipped.find((candidate) => candidate === locale);
    if (found !== undefined) return found;
    const why = (listed as readonly string[]).includes(locale)
      ? 'a shot has no caption in it'
      : 'it has no store listing';
    throw new Error(`no store shots in ${locale}: ${why}`);
  });
}
