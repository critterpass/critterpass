/**
 * Forms prompt: per critter, the four forms' names, notes and requirement copy, three palette
 * options for each recoloured form and the epic pose; plus how each form is found (the spawn rule
 * the spawns stage turns into places). Code picks the palette; the model never sets edges or xp.
 */
import { z } from 'zod';

import type { Brief, GenerationUnit, Prompt } from '../types';
import type { FormUnitInput } from './brief';

const HEX = /^#[0-9a-fA-F]{6}$/u;
const paletteSchema = z.object({
  f: z.string().regex(HEX),
  dk: z.string().regex(HEX),
  bl: z.string().regex(HEX),
});
export const requirementSchema = z.object({
  kind: z.enum(['presence', 'any_of', 'set_count', 'window', 'co_presence']),
  copy: z.string().min(1).max(60),
  /** The kind of place or the landmark, in plain words ("a water temple", "Mount Batur summit"). */
  where: z.string().min(1).max(80),
  n: z.number().int().min(1).max(10).nullable(),
  solar: z.enum(['after_dark', 'by_sunrise']).nullable(),
  min_members: z.number().int().min(2).max(12).nullable(),
});
const formSchema = z.object({
  name: z.string().min(1).max(32),
  note: z.string().min(1).max(140),
  requirement: requirementSchema,
});
export const formsOutputSchema = z.object({
  common: formSchema,
  rare: formSchema.extend({ palettes: z.array(paletteSchema).min(1).max(3) }),
  epic: formSchema.extend({ palettes: z.array(paletteSchema).min(1).max(3), pose: z.string() }),
  legendary: formSchema.extend({ palettes: z.array(paletteSchema).min(1).max(3) }),
});
export type FormsOutput = z.infer<typeof formsOutputSchema>;
export type Requirement = z.infer<typeof requirementSchema>;

const SYSTEM = `You design the four collectible forms of a CritterPass critter. Travellers befriend forms by visiting real places.
Rarities: common (the design colours), rare (a full recolour), epic (another recolour plus a pose), legendary (a gold form for a once-a-year window or the hardest thing the place has).
Form names: short, charming, at most 24 characters, built on the critter's name (e.g. "Temple Tokek", "Golden Tokek"); never a real person, brand or character.
Notes: one neutral sentence (at most 120 characters) about how this form looks or where it turns up; never the critter's own name, no "I", no exclamation marks.
Requirements say how the form is found, in requirement voice (at most 40 characters):
- presence: be at one specific landmark ("Summit Batur by sunrise").
- any_of: any of several places of one type; copy starts "At a" or "At an" ("At a water temple"); n = how many (1-3).
- set_count: befriend n other critters of the same set.
- window: legendary only, a festival or season date at a place.
- co_presence: several crew members together (min_members 2-6), usually for epic or legendary.
Common and rare forms use presence or any_of at easy, typical visitor places in the critter's city. Epic asks for more effort. Legendary uses window (a real annual festival or season) or the hardest thing the place has.
Palettes are three hex colours: f (body fill), dk (shading/markings), bl (belly/light). Rare and epic palettes must look clearly different from the common palette and from each other; avoid pure tier colours #4f86ff, #ff5fa8 and #ffd84a. Legendary palettes are gold: warm yellow fill, amber shading, cream belly.
Reply with JSON only.`;

const requirementJson = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['presence', 'any_of', 'set_count', 'window', 'co_presence'] },
    copy: { type: 'string' },
    where: { type: 'string' },
    n: { type: ['integer', 'null'] },
    solar: { type: ['string', 'null'], enum: ['after_dark', 'by_sunrise', null] },
    min_members: { type: ['integer', 'null'] },
  },
  required: ['kind', 'copy', 'where', 'n', 'solar', 'min_members'],
  additionalProperties: false,
};
const paletteJson = {
  type: 'object',
  properties: { f: { type: 'string' }, dk: { type: 'string' }, bl: { type: 'string' } },
  required: ['f', 'dk', 'bl'],
  additionalProperties: false,
};
const formJson = (extra: Record<string, unknown> = {}) => ({
  type: 'object',
  properties: {
    name: { type: 'string' },
    note: { type: 'string' },
    requirement: requirementJson,
    ...extra,
  },
  required: ['name', 'note', 'requirement', ...Object.keys(extra)],
  additionalProperties: false,
});

export function formsPrompt(unit: GenerationUnit, brief: Brief): Prompt {
  const input = unit.input as FormUnitInput;
  const notes = [
    brief.notes?.['*'],
    ...['common', 'rare', 'epic', 'legendary'].map((r) => brief.notes?.[`${input.critterId}:${r}`]),
  ].filter((line): line is string => line !== undefined);
  const palettes = { type: 'array', items: paletteJson, minItems: 3, maxItems: 3 };
  return {
    system: SYSTEM,
    user: `Critter ${input.critterId}: ${input.name}, a ${input.species} from ${input.city}, ${input.place}${input.guide ? ' (the live guide there)' : ''}.
Common palette: f ${input.common.f}, dk ${input.common.dk}, bl ${input.common.bl}.
Epic pose, one of: ${input.poses.join(', ')}.
${notes.length === 0 ? '' : `Reviewer notes from the last round:\n${notes.join('\n')}\n`}
Return {"common", "rare", "epic", "legendary"}; rare, epic and legendary carry three palette options each, epic also its pose.`,
    schema: formsOutputSchema,
    jsonSchema: {
      type: 'object',
      properties: {
        common: formJson(),
        rare: formJson({ palettes }),
        epic: formJson({ palettes, pose: { type: 'string', enum: [...input.poses] } }),
        legendary: formJson({ palettes }),
      },
      required: ['common', 'rare', 'epic', 'legendary'],
      additionalProperties: false,
    },
  };
}
