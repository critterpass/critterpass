/**
 * Travel insurance guidance per country: a general article (what cover matters there, what to do
 * when something happens) and a claim checklist, cited to official travel-advice pages. It never
 * names or recommends an insurer, and every article waits for legal review before it publishes.
 */
import { bannedHelpPhrases, insuranceItemSchema, type ContentItem } from '@cp/content';
import { z } from 'zod';

import { PLACE_FACTS } from '../../data/place-facts';
import { research, searchFromEnv, type ResearchHit } from '../../search';
import { suppliersNamed } from '../../suppliers';
import { checklistTable, sourcesBlock } from '../emergency/sources';
import { registerKind } from '../registry';
import type { Brief, GenerationUnit, KindModule, Prompt } from '../types';

interface InsuranceInput {
  readonly country: string;
  readonly name: string;
  readonly hits: readonly ResearchHit[];
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
/** Insurer names an article must never mention. */
const INSURERS = [
  'allianz',
  'axa',
  'chubb',
  'world nomads',
  'safetywing',
  'aig',
  'cigna',
  'generali',
  'zurich',
  'heymondo',
  'battleface',
];

async function insuranceBrief(): Promise<Brief> {
  const provider = searchFromEnv();
  const countries = [...new Set(Object.values(PLACE_FACTS).map((f) => f.country))].sort();
  const units: GenerationUnit[] = [];
  for (const country of countries) {
    const name = regionNames.of(country) ?? country;
    const hits = await research(
      provider,
      `${name} travel advice health medical care travel insurance official government`,
      { maxResults: 4 },
    );
    units.push({ id: country, input: { country, name, hits } satisfies InsuranceInput });
  }
  return { units };
}

const outputSchema = z.object({
  title: z.string().max(80),
  body_md: z.string(),
  claim_checklist: z.array(z.string().max(120)).min(3).max(8),
  source_urls: z.array(z.string()),
});

function insurancePrompt(unit: GenerationUnit): Prompt {
  const input = unit.input as InsuranceInput;
  return {
    system: `You write general travel insurance guidance for one country in plain English: what kinds of cover matter there (medical care costs, evacuation, activities), what to keep with you, and what to do after an incident. Base country specifics only on the sources given and list the source URLs you used (copied exactly). Never name, compare or recommend an insurer, and never give legal or medical advice; suggest checking the policy wording and asking the insurer. Body: 2-4 short paragraphs of Markdown, no headings. Claim checklist: 3-8 short steps. Reply with JSON only.`,
    user: `Country: ${input.name}.\nSources:\n${sourcesBlock(input.hits)}\n\nReturn {"title", "body_md", "claim_checklist", "source_urls"}.`,
    schema: outputSchema,
    jsonSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body_md: { type: 'string' },
        claim_checklist: { type: 'array', items: { type: 'string' } },
        source_urls: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'body_md', 'claim_checklist', 'source_urls'],
      additionalProperties: false,
    },
  };
}

export function toInsurance(
  input: InsuranceInput,
  output: z.infer<typeof outputSchema>,
): ContentItem<'insurance'> | null {
  const known = new Set(input.hits.map((h) => h.url));
  const sources = output.source_urls.filter((url) => known.has(url) && url.startsWith('https://'));
  const parsed = insuranceItemSchema.safeParse({
    country: input.country,
    title: output.title,
    body_md: output.body_md,
    claim_checklist: output.claim_checklist,
    source_urls: sources,
    legal_reviewed: false,
  });
  return parsed.success ? parsed.data : null;
}

export const insuranceKind: KindModule<'insurance'> = {
  kind: 'insurance',
  title: () => 'Insurance guidance · every place’s country',
  gate: 'record_verification',
  brief: () => insuranceBrief(),
  prompt: insurancePrompt,
  assemble: (_ctx, brief, outputs) =>
    Promise.resolve(
      brief.units.flatMap((unit) => {
        const output = outputs.get(unit.id) as z.infer<typeof outputSchema> | undefined;
        const item =
          output === undefined ? null : toInsurance(unit.input as InsuranceInput, output);
        return item === null ? [] : [item];
      }),
    ),
  validators: {
    items: [
      {
        id: 'no-endorsements',
        severity: 'fail',
        check: (item) => {
          const text =
            `${item.title} ${item.body_md} ${item.claim_checklist.join(' ')}`.toLowerCase();
          const insurers = INSURERS.filter((name) => new RegExp(`\\b${name}\\b`, 'u').test(text));
          return [...insurers, ...suppliersNamed(text)].map((name) => `names ${name}`);
        },
      },
      {
        id: 'banned-claims',
        severity: 'fail',
        check: (item) => bannedHelpPhrases(item.body_md).map((p) => `promises "${p}"`),
      },
      {
        id: 'legal-review',
        severity: 'warn',
        check: (item) => (item.legal_reviewed ? [] : ['waits for legal review']),
      },
    ],
    batch: [],
  },
  checklist: (ctx, items) =>
    checklistTable(
      `Insurance guidance · ${ctx.batchKey} (legal review)`,
      items.map((i) => [i.country, i.title, i.source_urls.join(' ')]),
      ['Country', 'Title', 'Sources'],
    ),
  blockedReason: (items) => {
    const open = items.filter((i) => !i.legal_reviewed).length;
    return open === 0 ? null : `${open} articles wait for legal review`;
  },
};

registerKind(insuranceKind);
