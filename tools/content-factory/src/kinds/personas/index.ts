/**
 * Persona packs: the live guides and the guest guide. Each pack starts from the AI package's
 * repo pack (voice register, chattiness budgets, colour) and the lines the design gives the guide;
 * the model adds catchphrases, local words (unvetted until a native speaker checks them), taboos,
 * the AI disclosure line and prompt fixtures for the persona eval. The pack must parse against the
 * guide persona schema, keep its canonical colour, and the guest pack never names a local critter.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { personaPackSchema, REPO_PACKS, type PersonaId } from '@cp/ai';
import { PERSONA_KEYS, personaItemSchema, type ContentItem } from '@cp/content';
import { critters, isGuideSpec } from '@cp/critter-art';
import { z } from 'zod';

import { REPO_DIR } from '../../work';
import { registerKind } from '../registry';
import type { Brief, GenerationUnit, KindModule, Prompt } from '../types';

const CANONICAL_COLOUR: Readonly<Record<PersonaId, string>> = {
  tokek: 'yellow',
  pon: 'orange',
  lundi: 'blue',
  ajo: 'pink',
  sardi: 'green',
  paco: 'cream',
  chava: 'red',
  guest: 'yellow',
};

/** Screen text lines the design gives a guide (it names them in caps or speaks as them). */
function designLines(name: string): string[] {
  const screens = JSON.parse(
    readFileSync(path.join(REPO_DIR, 'docs', 'design-renders', 'screens.json'), 'utf8'),
  ) as {
    screenText: string;
  }[];
  const lines = screens.flatMap((s) => s.screenText.split('\n'));
  return [
    ...new Set(
      lines.filter((line) => line.length > 25 && line.length < 140 && line.includes(name)),
    ),
  ].slice(0, 12);
}

const outputSchema = z.object({
  catchphrases: z.array(z.string().min(1).max(80)).min(4).max(8),
  local_words: z
    .array(z.object({ term: z.string().min(1), gloss: z.string().min(1), when: z.string().min(1) }))
    .max(10),
  taboos: z.array(z.string().min(1).max(200)).min(2).max(6),
  ai_disclosure: z.string().min(1).max(120),
  fixtures: z
    .array(
      z.object({
        prompt: z.string().min(1),
        expect_any: z.array(z.string().min(1)).min(1),
        forbid: z.array(z.string().min(1)),
      }),
    )
    .min(3)
    .max(5),
});
type PersonaOutput = z.infer<typeof outputSchema>;

const SYSTEM = `You extend a travel-guide persona for CritterPass. Guides are critters who talk to a travelling crew; they are warm, brief and useful, never salesy.
Given the guide's current pack and lines from the app's design, add:
- catchphrases: 4-8 short lines in the guide's own voice (keep the existing ones).
- local_words: up to 10 common, correct words of the destination's language with an English gloss and when the guide uses them (the guest guide has none).
- taboos: 2-6 things the guide never does (keep the existing ones; never give medical, legal or visa answers; never pretend a guess is local knowledge).
- ai_disclosure: one plain line saying the guide is an AI and can be wrong.
- fixtures: 3-5 test prompts a traveller might send, each with phrases a good in-voice answer would contain (expect_any, lowercase) and phrases it must never contain (forbid).
Never name real people, brands or businesses. Reply with JSON only.`;

function personasBrief(): Brief {
  const units: GenerationUnit[] = PERSONA_KEYS.map((id) => ({
    id,
    input: { pack: REPO_PACKS[id], designLines: designLines(REPO_PACKS[id].name) },
  }));
  return { units };
}

function personasPrompt(unit: GenerationUnit, brief: Brief): Prompt {
  const input = unit.input as { pack: unknown; designLines: string[] };
  const notes = brief.notes?.[unit.id] ?? brief.notes?.['*'];
  return {
    system: SYSTEM,
    user: `Current pack:\n${JSON.stringify(input.pack, null, 2)}\n\nDesign lines:\n${input.designLines.map((l) => `- ${l}`).join('\n') || '(none)'}\n${notes ? `\nReviewer notes: ${notes}\n` : ''}\nReturn {"catchphrases", "local_words", "taboos", "ai_disclosure", "fixtures"}.`,
    schema: outputSchema,
    jsonSchema: {
      type: 'object',
      properties: {
        catchphrases: { type: 'array', items: { type: 'string' } },
        local_words: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              term: { type: 'string' },
              gloss: { type: 'string' },
              when: { type: 'string' },
            },
            required: ['term', 'gloss', 'when'],
            additionalProperties: false,
          },
        },
        taboos: { type: 'array', items: { type: 'string' } },
        ai_disclosure: { type: 'string' },
        fixtures: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              prompt: { type: 'string' },
              expect_any: { type: 'array', items: { type: 'string' } },
              forbid: { type: 'array', items: { type: 'string' } },
            },
            required: ['prompt', 'expect_any', 'forbid'],
            additionalProperties: false,
          },
        },
      },
      required: ['catchphrases', 'local_words', 'taboos', 'ai_disclosure', 'fixtures'],
      additionalProperties: false,
    },
  };
}

export function toPersona(
  id: PersonaId,
  output: PersonaOutput,
  version: string,
): ContentItem<'personas'> {
  const base = REPO_PACKS[id];
  const known = new Set(base.local_words.map((w) => w.term.toLowerCase()));
  const pack = personaPackSchema.parse({
    ...base,
    version,
    status: 'draft',
    catchphrases: [...new Set([...base.catchphrases, ...output.catchphrases])].slice(0, 10),
    local_words:
      id === 'guest'
        ? []
        : [
            ...base.local_words,
            ...output.local_words
              .filter((w) => !known.has(w.term.toLowerCase()))
              .map((w) => ({ ...w, ipa: null, vetted: false })),
          ],
    taboos: [...new Set([...base.taboos, ...output.taboos])],
  });
  return personaItemSchema.parse({
    id,
    pack,
    ai_disclosure: output.ai_disclosure,
    fixtures: output.fixtures,
  });
}

const LOCAL_NAMES = critters.filter((c) => !isGuideSpec(c.spec)).map((c) => c.name);

export const personasKind: KindModule<'personas'> = {
  kind: 'personas',
  title: () => 'Persona packs · 6 guides and the guest guide',
  gate: 'persona_review',
  brief: () => Promise.resolve(personasBrief()),
  prompt: personasPrompt,
  assemble: (ctx, brief, outputs) =>
    Promise.resolve(
      brief.units.flatMap((unit) => {
        const output = outputs.get(unit.id) as PersonaOutput | undefined;
        return output === undefined
          ? []
          : [toPersona(unit.id as PersonaId, output, `content-${ctx.batchKey}`)];
      }),
    ),
  validators: {
    items: [
      {
        id: 'persona-schema',
        severity: 'fail',
        check: (item) => {
          const parsed = personaPackSchema.safeParse(item.pack);
          return parsed.success
            ? []
            : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
        },
      },
      {
        id: 'canonical-colour',
        severity: 'fail',
        check: (item) =>
          item.pack['colour'] === CANONICAL_COLOUR[item.id]
            ? []
            : [`${item.id} must stay ${CANONICAL_COLOUR[item.id]}`],
      },
      {
        id: 'guest-names-no-locals',
        severity: 'fail',
        check: (item) => {
          if (item.id !== 'guest') return [];
          const text = JSON.stringify(item).toLowerCase();
          return LOCAL_NAMES.filter(
            (name) => name.length >= 4 && new RegExp(`\\b${name.toLowerCase()}\\b`, 'u').test(text),
          ).map((name) => `guest pack names the local ${name}`);
        },
      },
      {
        id: 'local-words-vetted',
        severity: 'warn',
        check: (item) => {
          const words =
            (item.pack['local_words'] as { term: string; vetted: boolean }[] | undefined) ?? [];
          const unvetted = words.filter((w) => !w.vetted).map((w) => w.term);
          return unvetted.length === 0
            ? []
            : [
                `${unvetted.length} local words wait for a native speaker (${unvetted.slice(0, 3).join(', ')})`,
              ];
        },
      },
    ],
    batch: [
      {
        id: 'seven-packs',
        severity: 'fail',
        check: ({ items }) =>
          items.length === 7 ? [] : [{ ref: null, message: `${items.length} packs, needs 7` }],
      },
    ],
  },
};

registerKind(personasKind);
