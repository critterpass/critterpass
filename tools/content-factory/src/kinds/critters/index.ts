/**
 * Critters: all 150 dex entries with their design names, a native-script name where the place
 * writes in one, a neutral dex note and the design's art. Batches wait for the owner's IP sign-off.
 */
import path from 'node:path';

import { critterItemSchema, type ContentItem } from '@cp/content';
import { canonicalSeed } from '@cp/critter-art';

import { writeContactSheet } from '../../render/contact-sheet';
import { registerKind } from '../registry';
import type { KindModule } from '../types';
import { critterBrief, dexEntry, type CritterUnitInput } from './brief';
import { critterPrompt, type CritterOutput } from './prompt';
import { critterValidators } from './validate';

export const crittersKind: KindModule<'critters'> = {
  kind: 'critters',
  title: (ctx) =>
    ctx.options['places'] ? `Critters · ${ctx.options['places']}` : 'Critters · all places',
  gate: 'ip_signoff',
  brief: (ctx) => Promise.resolve(critterBrief(ctx.options)),
  prompt: critterPrompt,
  assemble: (_ctx, brief, outputs) =>
    Promise.resolve(
      brief.units.flatMap((unit) => {
        const input = unit.input as CritterUnitInput;
        const output = outputs.get(unit.id) as CritterOutput | undefined;
        if (output === undefined) return [];
        const byId = new Map(output.critters.map((c) => [c.id, c]));
        return input.critters.flatMap((c) => {
          const generated = byId.get(c.id);
          if (generated === undefined) return [];
          const entry = dexEntry(c.id);
          return [
            critterItemSchema.parse({
              id: c.id,
              no: entry.no,
              set_code: input.place,
              city: entry.city,
              species: entry.species,
              name: entry.name,
              name_native: generated.name_native,
              art_params: entry.spec,
              canonical_seed: canonicalSeed(entry),
              note: generated.note,
            }),
          ];
        });
      }),
    ),
  validators: critterValidators,
  ipNames: (item: ContentItem<'critters'>) => [item.name],
  render: (_ctx, items, outDir) => {
    const byPlace = new Map<string, ContentItem<'critters'>[]>();
    for (const item of items)
      byPlace.set(item.set_code, [...(byPlace.get(item.set_code) ?? []), item]);
    return Promise.resolve(
      [...byPlace].flatMap(([code, group]) => {
        const file = path.join('sheets', `critters-${code}.png`);
        writeContactSheet(
          path.join(outDir, file),
          `Critters · ${code.toUpperCase()}`,
          group.map((c) => ({
            critterId: c.id,
            label: `${c.id} ${c.name}${c.name_native ? ` ${c.name_native}` : ''}`,
          })),
        );
        return group.map((c) => ({ ref: c.id, file }));
      }),
    );
  },
};

registerKind(crittersKind);
