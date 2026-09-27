/**
 * Legendary windows: when each legendary form can be found. The six designed windows (3l-9) ship
 * exactly as designed. Every other legendary gets a dated window only when research finds an
 * annual festival or season with a source page for it; the date rule is structured from that page
 * and keeps its link. Without a source it becomes a challenge: the hardest thing the place has,
 * any day. Batches wait for the owner to confirm the dated sources.
 */
import {
  currentRelease,
  legendaryWindowItemSchema,
  windowMonths,
  type ContentItem,
} from '@cp/content';
import { z } from 'zod';

import { committedItems } from '../../committed';
import { research, searchFromEnv, type ResearchHit } from '../../search';
import { dexEntry } from '../critters/brief';
import { registerKind } from '../registry';
import type { Brief, GenerationUnit, KindModule, Prompt } from '../types';

interface Legendary {
  readonly formId: string;
  readonly name: string;
  readonly requirement: string;
  readonly city: string;
  readonly place: string;
  readonly hits: readonly ResearchHit[];
}
interface WindowUnitInput {
  readonly place: string;
  readonly legendaries: readonly Legendary[];
}

const DESIGNED = currentRelease('windows')?.items ?? [];
const designedFor = new Map(DESIGNED.map((w) => [w.form_id, w]));

const outputSchema = z.object({
  windows: z.array(
    z.object({
      form_id: z.string(),
      id: z.string().nullable(),
      place_line: z.string().nullable(),
      type: z.enum(['annual_range', 'month_part', 'any_day']).nullable(),
      start: z.string().nullable(),
      end: z.string().nullable(),
      month: z.number().int().min(1).max(12).nullable(),
      part: z.enum(['early', 'mid', 'late']).nullable(),
      solar: z.enum(['after_dark', 'by_sunrise']).nullable(),
      challenge: z.string().max(80).nullable(),
      source_url: z.string().nullable(),
    }),
  ),
});
type WindowOutput = z.infer<typeof outputSchema>['windows'][number];

const SYSTEM = `You set when legendary CritterPass forms can be found. For each legendary you get its name, what finding it takes, its city, and web search results.
Choose one rule:
- annual_range: the same calendar days every year (start and end as MM-DD), for a festival with fixed dates.
- month_part: a festival or natural season whose date moves (month 1-12 and part early/mid/late).
- any_day: no dated event; give "challenge", the hardest thing the place has, in requirement voice (at most 40 characters).
Dated rules need a source: copy source_url exactly from the search results that state the date. Never invent a date or a link; if no result states it, use any_day.
place_line reads "City · event" (at most 40 characters). id is a lowercase slug of the form name. solar is after_dark or by_sunrise only when the event happens then.
Reply with JSON only.`;

async function windowsBrief(): Promise<Brief> {
  const provider = searchFromEnv();
  const legendaries = committedItems('forms').filter(
    (f) => f.rarity === 'legendary' && !designedFor.has(f.id),
  );
  const byPlace = new Map<string, Legendary[]>();
  for (const form of legendaries) {
    const critter = dexEntry(form.critter_id);
    const hits = await research(
      provider,
      `${critter.city} ${critter.place} annual festival or season dates ${form.requirement_copy}`,
    );
    const entry: Legendary = {
      formId: form.id,
      name: form.name,
      requirement: form.requirement_copy,
      city: critter.city,
      place: critter.place,
      hits,
    };
    byPlace.set(critter.code, [...(byPlace.get(critter.code) ?? []), entry]);
  }
  const units: GenerationUnit[] = [...byPlace].map(([place, list]) => ({
    id: place,
    input: { place, legendaries: list } satisfies WindowUnitInput,
  }));
  return { units };
}

function windowsPrompt(unit: GenerationUnit): Prompt {
  const input = unit.input as WindowUnitInput;
  const blocks = input.legendaries.map((l) => {
    const results = l.hits.map(
      (h, i) =>
        `  [${i + 1}] ${h.url}\n      ${h.title}: ${h.content.replace(/\s+/gu, ' ').slice(0, 400)}`,
    );
    return `${l.formId} "${l.name}" in ${l.city}, ${l.place}; to find it: ${l.requirement}\n  Search results:\n${results.join('\n') || '  (none)'}`;
  });
  return {
    system: SYSTEM,
    user: `${blocks.join('\n\n')}\n\nReturn {"windows": [...]} with one entry per legendary.`,
    schema: outputSchema,
    jsonSchema: {
      type: 'object',
      properties: {
        windows: {
          type: 'array',
          items: {
            type: 'object',
            properties: Object.fromEntries(
              [
                'form_id',
                'id',
                'place_line',
                'type',
                'start',
                'end',
                'month',
                'part',
                'solar',
                'challenge',
                'source_url',
              ].map((key) => [
                key,
                { type: ['month'].includes(key) ? ['integer', 'null'] : ['string', 'null'] },
              ]),
            ),
            required: [
              'form_id',
              'id',
              'place_line',
              'type',
              'start',
              'end',
              'month',
              'part',
              'solar',
              'challenge',
              'source_url',
            ],
            additionalProperties: false,
          },
        },
      },
      required: ['windows'],
      additionalProperties: false,
    },
  };
}

/** A window from the model's answer; dated rules whose link is not one of the results become challenges. */
export function toWindow(output: WindowOutput, legendary: Legendary): ContentItem<'windows'> {
  const cited =
    output.source_url !== null &&
    output.source_url.startsWith('https://') &&
    legendary.hits.some((hit) => hit.url === output.source_url);
  const dated =
    cited &&
    ((output.type === 'annual_range' && output.start !== null && output.end !== null) ||
      (output.type === 'month_part' && output.month !== null && output.part !== null));
  const slug = (output.id ?? legendary.name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
  const placeLine = (output.place_line ?? `${legendary.city} · ${legendary.name}`).slice(0, 60);
  const rule = !dated
    ? { type: 'any_day' as const }
    : output.type === 'annual_range'
      ? { type: 'annual_range' as const, start: output.start ?? '', end: output.end ?? '' }
      : { type: 'month_part' as const, month: output.month ?? 1, part: output.part ?? 'early' };
  return legendaryWindowItemSchema.parse({
    id: `${slug}-${legendary.formId.slice(3, 6)}`,
    form_id: legendary.formId,
    place_line: placeLine,
    rule,
    solar: output.solar,
    challenge: dated ? null : (output.challenge ?? legendary.requirement).slice(0, 80),
    source_url: dated ? output.source_url : null,
    designed: false,
  });
}

export const windowsKind: KindModule<'windows'> = {
  kind: 'windows',
  title: () => 'Legendary windows',
  gate: 'window_sources',
  brief: () => windowsBrief(),
  prompt: windowsPrompt,
  assemble: (_ctx, brief, outputs) => {
    const generated = brief.units.flatMap((unit) => {
      const input = unit.input as WindowUnitInput;
      const output = outputs.get(unit.id) as z.infer<typeof outputSchema> | undefined;
      if (output === undefined) return [];
      return input.legendaries.flatMap((legendary) => {
        // Replies sometimes shorten the form id to the critter id; fall back to that, then order.
        const answer =
          output.windows.find((w) => w.form_id === legendary.formId) ??
          output.windows.find((w) => legendary.formId.startsWith(w.form_id)) ??
          output.windows[input.legendaries.indexOf(legendary)];
        return answer === undefined ? [] : [toWindow(answer, legendary)];
      });
    });
    return Promise.resolve([...DESIGNED, ...generated]);
  },
  validators: {
    items: [
      {
        id: 'designed-exact',
        severity: 'fail',
        check: (item) => {
          const designed = designedFor.get(item.form_id);
          return designed === undefined || JSON.stringify(designed) === JSON.stringify(item)
            ? []
            : [`${item.form_id} must keep its designed window`];
        },
      },
      {
        id: 'legendary-exists',
        severity: 'fail',
        check: (item) => {
          const forms = committedItems('forms');
          return forms.length === 0 || forms.some((f) => f.id === item.form_id)
            ? []
            : [`${item.form_id} is not a form`];
        },
      },
    ],
    batch: [
      {
        id: 'every-month',
        severity: 'fail',
        check: ({ items }) => {
          const months = new Set(items.flatMap((w) => [...windowMonths(w.rule)]));
          return months.size === 12
            ? []
            : [{ ref: null, message: `only ${months.size} months have a window` }];
        },
      },
      {
        id: 'one-per-legendary',
        severity: 'fail',
        check: ({ items }) => {
          const seen = new Set<string>();
          return items.flatMap((w) => {
            if (seen.has(w.form_id))
              return [{ ref: w.id, message: `${w.form_id} has two windows` }];
            seen.add(w.form_id);
            return [];
          });
        },
      },
    ],
  },
};

registerKind(windowsKind);
