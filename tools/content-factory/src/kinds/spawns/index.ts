/**
 * Spawn rules: how each of the 600 forms is found. The model turns each form's requirement copy
 * into a rule kind and the real places it means (named landmarks with coordinates and a geofence
 * radius); code fills in the window for legendaries, the destination, the home-set foreground rule
 * and the defaults (50 m, 300 s). Where curated POIs exist the places team swaps geofences for POI
 * refs in a later batch; geofences are checked against the place's borders.
 */
import { DEFAULT_DWELL_S, spawnRuleItemSchema, type ContentItem } from '@cp/content';
import { z } from 'zod';

import { committedItems } from '../../committed';
import { insidePlace } from '../../data/country-bounds';
import { placeFacts } from '../../data/place-facts';
import { dexEntry } from '../critters/brief';
import { registerKind } from '../registry';
import type { Brief, GenerationUnit, KindModule, Prompt } from '../types';

/** The critter city a live guide destination covers. */
const DESTINATION_CITY: Readonly<Record<string, string>> = {
  bali: 'Bali',
  kyoto: 'Kyoto',
  iceland: 'Reykjavík',
  'mexico-city': 'Mexico City',
  lisbon: 'Lisbon',
  cusco: 'Cusco',
};
const HOME_SET = 'vn';

interface SpawnUnitInput {
  readonly critterId: string;
  readonly name: string;
  readonly species: string;
  readonly city: string;
  readonly place: string;
  readonly forms: readonly {
    id: string;
    rarity: string;
    requirement: string;
    window: string | null;
  }[];
}

const geofence = z.object({
  label: z.string().min(1).max(80),
  lat: z.number(),
  lng: z.number(),
  radius_m: z.number().int(),
});
const outputSchema = z.object({
  rules: z.array(
    z.object({
      form_id: z.string(),
      kind: z.enum(['presence', 'any_of', 'set_count', 'window', 'co_presence']),
      geofences: z.array(geofence),
      n: z.number().int().nullable(),
      solar: z.enum(['after_dark', 'by_sunrise']).nullable(),
      min_members: z.number().int().nullable(),
    }),
  ),
});
type RuleOutput = z.infer<typeof outputSchema>['rules'][number];

const SYSTEM = `You turn CritterPass form requirements into spawn rules at real places.
For each form give:
- kind: presence (one landmark), any_of (any of several places of one type; n = how many must be visited, at most the places listed), set_count (befriend n other critters of the set; no places), window (legendary with a window id given; list the place it happens), co_presence (min_members crew together at a place).
- geofences: real, well-known, publicly accessible places in or near the given city that match the requirement, each with an accurate latitude/longitude (5 decimals) and a radius in metres between 30 and 300 that covers the spot (small shrines 40, squares 80, parks and beaches 200-300). any_of lists 3 places.
- solar: after_dark or by_sunrise only when the requirement says so.
Only use places you are sure exist at those coordinates. Reply with JSON only.`;

function spawnsBrief(options: Readonly<Record<string, string>>): Brief {
  const wanted = options['places']?.split(',');
  const windows = new Map(committedItems('windows').map((w) => [w.form_id, w.id]));
  const byCritter = new Map<string, ContentItem<'forms'>[]>();
  for (const form of committedItems('forms'))
    byCritter.set(form.critter_id, [...(byCritter.get(form.critter_id) ?? []), form]);
  const units: GenerationUnit[] = [...byCritter]
    .filter(([id]) => wanted === undefined || wanted.includes(dexEntry(id).code))
    .map(([id, forms]) => {
      const critter = dexEntry(id);
      const input: SpawnUnitInput = {
        critterId: id,
        name: critter.name,
        species: critter.species,
        city: critter.city,
        place: critter.place,
        forms: forms.map((f) => ({
          id: f.id,
          rarity: f.rarity,
          requirement: f.requirement_copy,
          window: windows.get(f.id) ?? null,
        })),
      };
      return { id, input };
    });
  return { units };
}

function spawnsPrompt(unit: GenerationUnit): Prompt {
  const input = unit.input as SpawnUnitInput;
  const forms = input.forms
    .map(
      (f) =>
        `- ${f.id} (${f.rarity}): "${f.requirement}"${f.window ? ` · legendary window ${f.window}` : ''}`,
    )
    .join('\n');
  return {
    system: SYSTEM,
    user: `${input.name}, a ${input.species}, lives in ${input.city}, ${input.place}.\nForms:\n${forms}\n\nReturn {"rules": [...]} with one rule per form.`,
    schema: outputSchema,
    jsonSchema: {
      type: 'object',
      properties: {
        rules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              form_id: { type: 'string' },
              kind: {
                type: 'string',
                enum: ['presence', 'any_of', 'set_count', 'window', 'co_presence'],
              },
              geofences: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    lat: { type: 'number' },
                    lng: { type: 'number' },
                    radius_m: { type: 'integer' },
                  },
                  required: ['label', 'lat', 'lng', 'radius_m'],
                  additionalProperties: false,
                },
              },
              n: { type: ['integer', 'null'] },
              solar: { type: ['string', 'null'], enum: ['after_dark', 'by_sunrise', null] },
              min_members: { type: ['integer', 'null'] },
            },
            required: ['form_id', 'kind', 'geofences', 'n', 'solar', 'min_members'],
            additionalProperties: false,
          },
        },
      },
      required: ['rules'],
      additionalProperties: false,
    },
  };
}

const clampRadius = (r: number) => Math.min(300, Math.max(30, Math.round(r)));

export function toRule(
  input: SpawnUnitInput,
  form: SpawnUnitInput['forms'][number],
  out: RuleOutput,
): ContentItem<'spawns'> {
  const code = dexEntry(input.critterId).code;
  const facts = placeFacts(code);
  const destination =
    facts.destination !== null && DESTINATION_CITY[facts.destination] === input.city
      ? facts.destination
      : null;
  const kind = form.window !== null ? 'window' : out.kind === 'window' ? 'presence' : out.kind;
  const geofences =
    kind === 'set_count'
      ? []
      : out.geofences.map((g) => ({ ...g, radius_m: clampRadius(g.radius_m) }));
  const anyOf = kind === 'any_of';
  const copy =
    anyOf && !/^At an? /u.test(form.requirement)
      ? `At a ${form.requirement.replace(/^at /iu, '')}`
      : form.requirement;
  return spawnRuleItemSchema.parse({
    id: `${form.id}#1`,
    form_id: form.id,
    kind,
    set_code: code,
    destination,
    poi_refs: [],
    geofences,
    n: anyOf
      ? Math.min(Math.max(out.n ?? 1, 1), geofences.length)
      : kind === 'set_count'
        ? Math.max(out.n ?? 2, 1)
        : null,
    dwell_s: DEFAULT_DWELL_S,
    hold_ms: form.rarity === 'legendary' ? 4000 : null,
    window_id: kind === 'window' ? form.window : null,
    solar: out.solar,
    min_members: kind === 'co_presence' ? Math.max(out.min_members ?? 2, 2) : null,
    foreground_only: code === HOME_SET,
    copy: copy.slice(0, 60),
  });
}

export const spawnsKind: KindModule<'spawns'> = {
  kind: 'spawns',
  title: (ctx) =>
    ctx.options['places'] ? `Spawn rules · ${ctx.options['places']}` : 'Spawn rules · all forms',
  gate: 'owner_approval',
  brief: (ctx) => Promise.resolve(spawnsBrief(ctx.options)),
  prompt: spawnsPrompt,
  assemble: (_ctx, brief, outputs) =>
    Promise.resolve(
      brief.units.flatMap((unit) => {
        const input = unit.input as SpawnUnitInput;
        const output = outputs.get(unit.id) as z.infer<typeof outputSchema> | undefined;
        if (output === undefined) return [];
        return input.forms.flatMap((form) => {
          const rule = output.rules.find((r) => r.form_id === form.id);
          if (rule === undefined) return [];
          try {
            return [toRule(input, form, rule)];
          } catch {
            return [];
          }
        });
      }),
    ),
  validators: {
    items: [
      {
        id: 'inside-place',
        severity: 'fail',
        check: (rule) =>
          rule.geofences
            .filter((g) => !insidePlace(rule.set_code, g.lat, g.lng))
            .map(
              (g) => `${g.label} (${g.lat}, ${g.lng}) is outside ${rule.set_code.toUpperCase()}`,
            ),
      },
      {
        id: 'window-resolves',
        severity: 'fail',
        check: (rule) => {
          if (rule.window_id === null) return [];
          return committedItems('windows').some((w) => w.id === rule.window_id)
            ? []
            : [`window ${rule.window_id} does not exist`];
        },
      },
      {
        id: 'home-set-foreground',
        severity: 'fail',
        check: (rule) =>
          rule.set_code === HOME_SET && !rule.foreground_only
            ? ['home-set rules fire in the foreground only']
            : [],
      },
    ],
    batch: [
      {
        id: 'reachable',
        severity: 'fail',
        check: ({ items }) => {
          const ruled = new Set(items.map((r) => r.form_id));
          const wanted = new Set(items.map((r) => dexEntry(r.form_id.slice(0, 6)).code));
          return committedItems('forms')
            .filter((f) => wanted.has(dexEntry(f.critter_id).code) && !ruled.has(f.id))
            .map((f) => ({ ref: null, message: `${f.id} has no spawn rule` }));
        },
      },
    ],
  },
};

registerKind(spawnsKind);
