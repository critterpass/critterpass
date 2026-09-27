/**
 * Forms review renders: per set, one contact sheet with every critter's four forms (unlocked and
 * locked, 96 and 24 pt, light and dark, with the sticker so epic and legendary edges show), and the
 * epic-versus-common pixel difference the validators check.
 */
import path from 'node:path';

import type { ContentItem } from '@cp/content';
import type { FormSpec } from '@cp/critter-art';

import { critterSpec, pixelDiff, writeContactSheet } from '../../render/contact-sheet';
import type { RenderedItem } from '../types';
import { dexEntry } from '../critters/brief';

type Form = ContentItem<'forms'>;

const formSpec = (item: Form): FormSpec => ({
  rarity: item.rarity,
  palette: { f: item.palette.f, dk: item.palette.dk, bl: item.palette.bl },
  edge: item.edge,
  ...(item.pose === null ? {} : { pose: item.pose }),
});

export function epicPixelDiff(item: Form): number {
  return pixelDiff(critterSpec(item.critter_id), critterSpec(item.critter_id, formSpec(item)));
}

export function formsContactSheets(items: readonly Form[], outDir: string): RenderedItem[] {
  const bySet = new Map<string, Form[]>();
  for (const item of items) {
    const code = dexEntry(item.critter_id).code;
    bySet.set(code, [...(bySet.get(code) ?? []), item]);
  }
  return [...bySet].flatMap(([code, forms]) => {
    const file = path.join('sheets', `forms-${code}.png`);
    writeContactSheet(
      path.join(outDir, file),
      `Forms · ${code.toUpperCase()}`,
      forms.map((form) => ({
        critterId: form.critter_id,
        label: `${form.id} ${form.name}${form.pose ? ` (${form.pose})` : ''}`,
        form: formSpec(form),
      })),
    );
    return forms.map((form) => ({ ref: form.id, file }));
  });
}
