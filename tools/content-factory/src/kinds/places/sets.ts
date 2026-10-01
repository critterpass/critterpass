/**
 * The 61-place index (`sets`): one critter set per place. Everything factual comes from the design
 * dex and the place facts table (country, languages, time zone, currency, live guide); the model
 * only writes the editorial month curve (crowd level 0–100 and a short note per month), which live
 * data overlays later.
 */
import { critters, isGuideSpec, places } from '@cp/critter-art';
import { placeIndexItemSchema, type ContentItem } from '@cp/content';
import { z } from 'zod';

import { committedItems } from '../../committed';
import { placeFacts } from '../../data/place-facts';
import { registerKind } from '../registry';
import type { Brief, GenerationUnit, KindModule, Prompt } from '../types';

interface SetUnitInput {
  readonly code: string;
  readonly name: string;
  readonly cities: readonly string[];
}

const outputSchema = z.object({
  months: z
    .array(
      z.object({ crowd: z.number().int().min(0).max(100), note: z.string().max(40).nullable() }),
    )
    .length(12),
});

const SYSTEM = `You write the editorial season curve for a travel destination: for each month January to December, how crowded it usually is with visitors (0 = empty, 100 = peak) and an optional note of at most 30 characters naming what drives it ("Cherry blossom", "Monsoon rains", "School holidays"), or null.
Base it on well-known, typical patterns; no prices, no hotels, no suppliers. Reply with JSON only.`;

/**
 * `--opt months=committed` re-issues the index from the current dex and place facts (a new guide,
 * a critter added to a set) and keeps each place's reviewed month curve from the committed batches,
 * with no model call.
 */
function setsBrief(options: Readonly<Record<string, string>>): Brief {
  if (options['months'] === 'committed') return { units: [], carried: committedItems('sets') };
  const units: GenerationUnit[] = places.map((place) => ({
    id: place.code,
    input: {
      code: place.code,
      name: place.name,
      cities: place.critterIds.map((id) => critters.find((c) => c.id === id)?.city ?? ''),
    } satisfies SetUnitInput,
  }));
  return { units };
}

function setsPrompt(unit: GenerationUnit): Prompt {
  const input = unit.input as SetUnitInput;
  return {
    system: SYSTEM,
    user: `${input.name} (visitors mostly go to ${input.cities.join(', ')}). Return {"months": [12 entries]}.`,
    schema: outputSchema,
    jsonSchema: {
      type: 'object',
      properties: {
        months: {
          type: 'array',
          minItems: 12,
          maxItems: 12,
          items: {
            type: 'object',
            properties: { crowd: { type: 'integer' }, note: { type: ['string', 'null'] } },
            required: ['crowd', 'note'],
            additionalProperties: false,
          },
        },
      },
      required: ['months'],
      additionalProperties: false,
    },
  };
}

export function placeIndexItem(
  code: string,
  months: z.infer<typeof outputSchema>['months'],
): ContentItem<'sets'> {
  const place = places.find((p) => p.code === code);
  if (place === undefined) throw new Error(`unknown place ${code}`);
  const facts = placeFacts(code);
  const guideCritter = place.critterIds.find((id) => {
    const critter = critters.find((c) => c.id === id);
    return critter !== undefined && isGuideSpec(critter.spec);
  });
  return placeIndexItemSchema.parse({
    code,
    name: place.name,
    country: facts.country,
    rank: place.rank,
    set_group: place.setGroup,
    tz: facts.tz,
    currency: facts.currency,
    languages: facts.languages,
    coverage: facts.guide === null ? 'guest' : 'live',
    guide: facts.guide,
    destination: facts.destination,
    hero_critter_id: guideCritter ?? place.critterIds[0],
    critter_ids: place.critterIds,
    month_hints: months,
  });
}

export const setsKind: KindModule<'sets'> = {
  kind: 'sets',
  title: () => '61-place index',
  gate: 'places_review',
  brief: (ctx) => Promise.resolve(setsBrief(ctx.options)),
  prompt: setsPrompt,
  assemble: (_ctx, brief, outputs) =>
    Promise.resolve([
      ...(brief.carried ?? []).map((raw) => {
        const item = placeIndexItemSchema.parse(raw);
        return placeIndexItem(item.code, item.month_hints);
      }),
      ...brief.units.flatMap((unit) => {
        const output = outputs.get(unit.id) as z.infer<typeof outputSchema> | undefined;
        return output === undefined ? [] : [placeIndexItem(unit.id, output.months)];
      }),
    ]),
  validators: {
    items: [
      {
        id: 'place-facts',
        severity: 'fail',
        check: (item) => {
          const facts = placeFacts(item.code);
          return facts.tz === item.tz &&
            facts.currency === item.currency &&
            facts.country === item.country
            ? []
            : [`${item.code} differs from its place facts`];
        },
      },
      {
        id: 'live-guide-home',
        severity: 'fail',
        check: (item) =>
          item.coverage === 'live' && item.destination === null
            ? ['a live place names its guide destination']
            : [],
      },
    ],
    batch: [
      {
        id: 'sixty-one-places',
        severity: 'fail',
        check: ({ items }) => {
          const critterCount = items.reduce((sum, p) => sum + p.critter_ids.length, 0);
          const problems = [];
          if (items.length !== places.length)
            problems.push({
              ref: null,
              message: `${items.length} places, the index has ${places.length}`,
            });
          if (items.length === places.length && critterCount !== critters.length)
            problems.push({
              ref: null,
              message: `sets hold ${critterCount} critters, the dex has ${critters.length}`,
            });
          return problems;
        },
      },
    ],
  },
};

registerKind(setsKind);
