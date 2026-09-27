/**
 * Form validators. Blocking: four forms per critter, designed forms kept exactly, recolours at
 * least ΔE2000 18 from the common form and clear of tier accents, legendaries in the gold family,
 * a critter's forms ΔE 10 apart, epic poses the archetype draws, and an epic that visibly differs
 * from its common (more than 3% of pixels). Warnings: shading contrast against the sticker under
 * 3:1, and rare/epic fills close to another critter's in the same set.
 */
import { findDesignedForm, type Palette } from '@cp/critter-art';
import { type ContentItem } from '@cp/content';

import { contrastRatio, deltaE2000 } from '../../color/color';
import type { Validators } from '../../validators/registry';
import { commonPalette } from './brief';
import { epicPixelDiff } from './contact-sheet';
import { MIN_DE_BETWEEN_FORMS, paletteProblems, STICKER } from './pick';
import { supportedEpicPoses } from './poses';
import { dexEntry } from '../critters/brief';

type Form = ContentItem<'forms'>;
const three = (p: Pick<Palette, 'f' | 'dk' | 'bl'>) => ({ f: p.f, dk: p.dk, bl: p.bl });

function siblingsOf(item: Form, items: readonly Form[]) {
  return items.filter((other) => other.critter_id === item.critter_id && other.id !== item.id);
}

export const formValidators: Validators<'forms'> = {
  items: [
    {
      id: 'designed-form',
      severity: 'fail',
      check: (item) => {
        const designed = findDesignedForm(item.critter_id, item.rarity);
        if (designed === undefined) return [];
        const same =
          JSON.stringify(three(designed.form.palette)) === JSON.stringify(three(item.palette)) &&
          (designed.form.pose ?? null) === item.pose &&
          designed.name === item.name;
        return same ? [] : [`${item.id} must keep its designed name, palette and pose`];
      },
    },
    {
      id: 'palette-rules',
      severity: 'fail',
      check: (item, { items }) => {
        if (
          item.rarity === 'common' ||
          findDesignedForm(item.critter_id, item.rarity) !== undefined
        )
          return [];
        const siblings = siblingsOf(item, items)
          .filter((s) => s.rarity !== 'common')
          .map((s) => three(s.palette));
        return paletteProblems(
          item.rarity,
          three(item.palette),
          commonPalette(dexEntry(item.critter_id)),
          siblings,
        );
      },
    },
    {
      id: 'pose-supported',
      severity: 'fail',
      check: (item) =>
        item.pose === null ||
        item.rarity !== 'epic' ||
        supportedEpicPoses(item.critter_id).includes(item.pose)
          ? []
          : [`${item.pose} is not a pose this archetype draws`],
    },
    {
      id: 'epic-differs',
      severity: 'fail',
      check: (item) => {
        if (item.rarity !== 'epic') return [];
        const diff = epicPixelDiff(item);
        return diff > 0.03
          ? []
          : [`epic differs from common in only ${(diff * 100).toFixed(1)}% of pixels`];
      },
    },
    {
      id: 'sticker-contrast',
      severity: 'warn',
      check: (item) => {
        const ratio = contrastRatio(item.palette.dk, STICKER);
        return ratio >= 3 ? [] : [`shading on the sticker is ${ratio.toFixed(1)}:1 (aim for 3:1)`];
      },
    },
    {
      id: 'note-hides-name',
      severity: 'fail',
      check: (item) => {
        const critter = dexEntry(item.critter_id);
        if (critter.species.toLowerCase().includes(critter.name.toLowerCase())) return [];
        return new RegExp(`(^|[^\\p{L}])${critter.name}([^\\p{L}]|$)`, 'iu').test(item.note)
          ? ['note gives away the critter name']
          : [];
      },
    },
  ],
  batch: [
    {
      id: 'four-forms',
      severity: 'fail',
      check: ({ items }) => {
        const count = new Map<string, number>();
        for (const item of items) count.set(item.critter_id, (count.get(item.critter_id) ?? 0) + 1);
        return [...count]
          .filter(([, n]) => n !== 4)
          .map(([id, n]) => ({ ref: null, message: `${id} has ${n} forms, needs 4` }));
      },
    },
    {
      id: 'set-spread',
      severity: 'warn',
      check: ({ items }) => {
        const problems: { ref: string; message: string }[] = [];
        const recoloured = items.filter((i) => i.rarity === 'rare' || i.rarity === 'epic');
        for (const item of recoloured) {
          const set = dexEntry(item.critter_id).code;
          const close = recoloured.find(
            (other) =>
              other.critter_id !== item.critter_id &&
              other.id < item.id &&
              dexEntry(other.critter_id).code === set &&
              deltaE2000(other.palette.f, item.palette.f) < MIN_DE_BETWEEN_FORMS,
          );
          if (close !== undefined)
            problems.push({
              ref: item.id,
              message: `fill is close to ${close.id} in the same set`,
            });
        }
        return problems;
      },
    },
  ],
};
