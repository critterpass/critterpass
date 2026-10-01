/**
 * Emergency numbers for every country of the 61 places. Official or government pages are searched,
 * the model structures the numbers it can see in one result (and links that result), and every
 * number must appear in the cited text. Records publish only after a person verifies each one.
 */
import { emergencyNumberItemSchema, EMERGENCY_SERVICES, type ContentItem } from '@cp/content';
import { z } from 'zod';

import { PLACE_FACTS } from '../../data/place-facts';
import { research, searchFromEnv, type ResearchHit } from '../../search';
import { registerKind } from '../registry';
import type { Brief, GenerationUnit, KindModule, Prompt } from '../types';
import { checklistTable, citedHit, numberInSource, sourcesBlock, todayIso } from './sources';

interface CountryInput {
  readonly country: string;
  readonly name: string;
  readonly hits: readonly ResearchHit[];
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const DIALABLE = /^\+?[0-9][0-9 -]{1,18}$/u;

async function emergencyBrief(): Promise<Brief> {
  const provider = searchFromEnv();
  const countries = [...new Set(Object.values(PLACE_FACTS).map((f) => f.country))].sort();
  const units: GenerationUnit[] = [];
  for (const country of countries) {
    const name = regionNames.of(country) ?? country;
    const hits = [
      ...(await research(
        provider,
        `${name} emergency phone numbers police ambulance fire official`,
        {
          maxResults: 5,
        },
      )),
      ...(await research(provider, `${name} emergency numbers for travellers embassy advice`, {
        maxResults: 3,
      })),
    ];
    units.push({ id: country, input: { country, name, hits } satisfies CountryInput });
  }
  return { units };
}

const outputSchema = z.object({
  source_url: z.string().nullable(),
  numbers: z.array(
    z.object({
      service: z.enum(EMERGENCY_SERVICES),
      number: z.string(),
      label: z.string(),
    }),
  ),
});

function emergencyPrompt(unit: GenerationUnit): Prompt {
  const input = unit.input as CountryInput;
  return {
    system: `You copy emergency phone numbers exactly as a source states them. Pick the most official source among the results (government, embassy or emergency service pages first) and list only numbers that source states, each with its service (${EMERGENCY_SERVICES.join(', ')}) and a short label such as "Ambulance, police, fire". Use "general" only for the one national number that reaches police, fire and ambulance (112, 911, 999, 000); a hotline that is none of the listed services (search and rescue, a helpline, a city's own line) is "other". Never add a number the source does not state. If no result states the numbers, return source_url null and no numbers. Reply with JSON only.`,
    user: `Country: ${input.name} (${input.country}).\nSearch results:\n${sourcesBlock(input.hits)}\n\nReturn {"source_url", "numbers": [...]}.`,
    schema: outputSchema,
    jsonSchema: {
      type: 'object',
      properties: {
        source_url: { type: ['string', 'null'] },
        numbers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              service: { type: 'string', enum: [...EMERGENCY_SERVICES] },
              number: { type: 'string' },
              label: { type: 'string' },
            },
            required: ['service', 'number', 'label'],
            additionalProperties: false,
          },
        },
      },
      required: ['source_url', 'numbers'],
      additionalProperties: false,
    },
  };
}

export function toEmergency(
  input: CountryInput,
  output: z.infer<typeof outputSchema>,
  now: Date,
): ContentItem<'emergency'> | null {
  const hit = citedHit(input.hits, output.source_url);
  if (hit === undefined) return null;
  const numbers = output.numbers
    .filter((n) => DIALABLE.test(n.number) && numberInSource(hit, n.number))
    .map((n) => ({ ...n, label: n.label.slice(0, 40) }));
  if (numbers.length === 0) return null;
  const parsed = emergencyNumberItemSchema.safeParse({
    country: input.country,
    numbers,
    source_url: hit.url,
    retrieved_on: todayIso(now),
    verified_at: null,
  });
  return parsed.success ? parsed.data : null;
}

export const emergencyKind: KindModule<'emergency'> = {
  kind: 'emergency',
  title: () => 'Emergency numbers · every place’s country',
  gate: 'record_verification',
  partialGeneration: true,
  brief: () => emergencyBrief(),
  prompt: emergencyPrompt,
  assemble: (ctx, brief, outputs) =>
    Promise.resolve(
      brief.units.flatMap((unit) => {
        const output = outputs.get(unit.id) as z.infer<typeof outputSchema> | undefined;
        const item =
          output === undefined ? null : toEmergency(unit.input as CountryInput, output, ctx.now);
        return item === null ? [] : [item];
      }),
    ),
  validators: {
    items: [
      {
        id: 'needs-verification',
        severity: 'warn',
        check: (item) =>
          item.verified_at === null ? ['waits for a person to verify it against the source'] : [],
      },
      {
        id: 'one-general-line',
        severity: 'warn',
        check: (item) =>
          item.numbers.filter((n) => n.service === 'general').length > 1
            ? ['several general lines: only an all-services number is general, the rest are other']
            : [],
      },
    ],
    batch: [
      {
        id: 'every-country',
        severity: 'warn',
        check: ({ items }) => {
          const have = new Set(items.map((i) => i.country));
          return [...new Set(Object.values(PLACE_FACTS).map((f) => f.country))]
            .filter((c) => !have.has(c))
            .map((c) => ({
              ref: null,
              message: `${c} has no sourced record yet; research it by hand`,
            }));
        },
      },
    ],
  },
  checklist: (ctx, items) =>
    checklistTable(
      `Emergency numbers · ${ctx.batchKey}`,
      items.map((i) => [
        i.country,
        i.numbers.map((n) => `${n.label}: ${n.number}`).join('; '),
        i.source_url,
        i.retrieved_on,
      ]),
      ['Country', 'Numbers', 'Source', 'Retrieved'],
    ),
  blockedReason: (items) => {
    const open = items.filter((i) => i.verified_at === null).length;
    return open === 0 ? null : `${open} records wait for a person to verify them`;
  },
};

registerKind(emergencyKind);
