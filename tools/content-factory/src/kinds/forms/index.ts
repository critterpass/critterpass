/**
 * Forms: 600 forms (four per critter). The model names them, writes their notes and requirement
 * copy and offers palettes; code picks palettes, sets poses from what the archetype draws, and
 * keeps the designed forms (Tokek rare/epic/golden, Sakura Pon) exactly.
 */
import { FORM_XP, formItemSchema, REQUIRED_EDGE, type Rarity } from '@cp/content';
import { findDesignedForm, type Pose } from '@cp/critter-art';

import { registerKind } from '../registry';
import type { KindModule } from '../types';
import { formsBrief, type FormUnitInput } from './brief';
import { formsContactSheets } from './contact-sheet';
import { pickPalette } from './pick';
import { formsPrompt, type FormsOutput } from './prompt';
import { formValidators } from './validate';
import type { ThreeSlot } from './palette-gen';

const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

function assembleCritter(input: FormUnitInput, output: FormsOutput, setFills: string[]): unknown[] {
  const picked: ThreeSlot[] = [];
  return RARITIES.map((rarity) => {
    const id = `${input.critterId}:${rarity}`;
    const generated = output[rarity];
    const designed = findDesignedForm(input.critterId, rarity);
    let palette: ThreeSlot;
    let pose: Pose | null = null;
    if (designed !== undefined) {
      palette = {
        f: designed.form.palette.f,
        dk: designed.form.palette.dk,
        bl: designed.form.palette.bl,
      };
      pose = designed.form.pose ?? null;
    } else if (rarity === 'common') {
      palette = input.common;
    } else {
      const options = 'palettes' in generated ? generated.palettes : [];
      palette = pickPalette(id, rarity, input.common, options, picked, setFills);
      if (rarity === 'epic') {
        const wanted = 'pose' in generated ? generated.pose : '';
        pose = (input.poses.includes(wanted) ? wanted : input.poses[0]) as Pose;
      }
    }
    if (rarity !== 'common') {
      picked.push(palette);
      if (rarity !== 'legendary') setFills.push(palette.f);
    }
    return formItemSchema.parse({
      id,
      critter_id: input.critterId,
      rarity,
      name: designed?.name ?? (rarity === 'common' ? input.name : generated.name),
      palette,
      pose,
      edge: REQUIRED_EDGE[rarity],
      note: generated.note,
      requirement_copy: generated.requirement.copy,
      xp: FORM_XP[rarity],
    });
  });
}

export const formsKind: KindModule<'forms'> = {
  kind: 'forms',
  title: (ctx) => (ctx.options['places'] ? `Forms · ${ctx.options['places']}` : 'Forms · all sets'),
  gate: 'contact_sheets',
  brief: (ctx) => Promise.resolve(formsBrief(ctx.options)),
  prompt: formsPrompt,
  assemble: (_ctx, brief, outputs) => {
    const setFills = new Map<string, string[]>();
    return Promise.resolve(
      brief.units.flatMap((unit) => {
        const input = unit.input as FormUnitInput;
        const output = outputs.get(unit.id) as FormsOutput | undefined;
        if (output === undefined) return [];
        const fills = setFills.get(input.placeCode) ?? [];
        setFills.set(input.placeCode, fills);
        return assembleCritter(input, output, fills);
      }),
    );
  },
  validators: formValidators,
  ipNames: (item) => [item.name],
  render: (_ctx, items, outDir) => Promise.resolve(formsContactSheets(items, outDir)),
};

registerKind(formsKind);
