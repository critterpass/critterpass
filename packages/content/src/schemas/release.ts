/**
 * The release envelope every content kind ships in: `{kind, version, checksum, items[],
 * generated_by, approved_by}`. The checksum is SHA-256 over the canonical JSON of kind, version
 * and items, so a release that was edited after approval no longer loads.
 */
import { CONTENT_RELEASE_KINDS } from '@cp/domain';
import { z } from 'zod';

import { critterItemSchema } from './critters';
import { emergencyNumberItemSchema, facilityItemSchema } from './emergency';
import { formItemSchema } from './forms';
import { helpArticleItemSchema } from './help';
import { insuranceItemSchema } from './insurance';
import { legendaryWindowItemSchema } from './legendary-windows';
import { personaItemSchema } from './personas';
import { phraseCardItemSchema } from './phrases';
import { placeIndexItemSchema, poiItemSchema } from './places';
import { spawnRuleItemSchema } from './spawn-rules';
import { quizQuestionItemSchema } from './taste-quiz';

/** Every content kind; the list lives in `@cp/domain` so the ops console shares it. */
export const CONTENT_KINDS = CONTENT_RELEASE_KINDS;
export const contentKindSchema = z.enum(CONTENT_KINDS);
export type ContentKind = z.infer<typeof contentKindSchema>;

export const CONTENT_ITEM_SCHEMAS = {
  sets: placeIndexItemSchema,
  critters: critterItemSchema,
  forms: formItemSchema,
  spawns: spawnRuleItemSchema,
  windows: legendaryWindowItemSchema,
  personas: personaItemSchema,
  places: poiItemSchema,
  phrases: phraseCardItemSchema,
  taste_quiz: quizQuestionItemSchema,
  help: helpArticleItemSchema,
  emergency: emergencyNumberItemSchema,
  facilities: facilityItemSchema,
  insurance: insuranceItemSchema,
} as const satisfies Record<ContentKind, z.ZodType>;

export type ContentItem<K extends ContentKind> = z.infer<(typeof CONTENT_ITEM_SCHEMAS)[K]>;

/** The stable key of an item inside its kind (what reviews and diffs refer to). */
export function itemRef<K extends ContentKind>(kind: K, item: ContentItem<K>): string {
  const record = item as Record<string, unknown>;
  const key =
    kind === 'sets'
      ? record['code']
      : kind === 'places'
        ? record['ref']
        : kind === 'help'
          ? `${String(record['locale'])}:${String(record['slug'])}`
          : kind === 'emergency' || kind === 'insurance'
            ? record['country']
            : kind === 'facilities'
              ? record['ref']
              : record['id'];
  return String(key);
}

export const generatedBySchema = z
  .object({
    /** Factory batch that produced the release (`2026-09-28-forms-01`). */
    batch_key: z.string().min(1),
    /** AI route and model the generation stage ran on; null for imported or hand-authored data. */
    route: z.string().min(1).nullable(),
    model: z.string().min(1).nullable(),
    generated_at: z.iso.datetime({ offset: true }),
  })
  .strict();

export const releaseEnvelopeSchema = z
  .object({
    kind: contentKindSchema,
    version: z.number().int().min(1),
    checksum: z.string().regex(/^[0-9a-f]{64}$/u),
    items: z.array(z.unknown()),
    generated_by: generatedBySchema,
    /** Admin uid of the owner who approved it; null for the designed fixtures shipped in the repo. */
    approved_by: z.uuid().nullable(),
  })
  .strict();
export type ReleaseEnvelope = z.infer<typeof releaseEnvelopeSchema>;

export interface Release<K extends ContentKind> extends Omit<ReleaseEnvelope, 'kind' | 'items'> {
  readonly kind: K;
  readonly items: readonly ContentItem<K>[];
}
