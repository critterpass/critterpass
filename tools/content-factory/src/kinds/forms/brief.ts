/**
 * Forms brief: one generation unit per critter, with the critter's design palette (the common
 * form), the epic poses its archetype draws and its place. `--opt places=id,jp` limits a batch to
 * some places (contact sheets are reviewed per set).
 */
import { critters, isGuideSpec, places, type Critter } from '@cp/critter-art';

import type { Brief, GenerationUnit } from '../types';
import type { ThreeSlot } from './palette-gen';
import { supportedEpicPoses } from './poses';

/** Design palettes of the six hand-drawn guides (their kinds' own default colours). */
const GUIDE_COMMON: Readonly<Record<string, ThreeSlot>> = {
  gecko: { f: '#a9d08c', dk: '#6f9f5a', bl: '#a9d08c' },
  tanuki: { f: '#ff9a4d', dk: '#6b3a24', bl: '#fff1dc' },
  axolotl: { f: '#ff9cc8', dk: '#ff4f9a', bl: '#ffe0ee' },
  sardine: { f: '#9fe0ee', dk: '#3d6fe0', bl: '#f2fbff' },
  alpaca: { f: '#fff1d6', dk: '#ff5fa8', bl: '#fffaf0' },
  puffin: { f: '#3d6fe0', dk: '#ff9a4d', bl: '#fff6e6' },
};

export function commonPalette(critter: Critter): ThreeSlot {
  if (isGuideSpec(critter.spec)) {
    const palette = GUIDE_COMMON[critter.spec.k];
    if (palette === undefined) throw new Error(`no design palette for guide ${critter.spec.k}`);
    return palette;
  }
  const [f, dk, bl] = critter.spec.c;
  return { f, dk, bl };
}

export interface FormUnitInput {
  readonly critterId: string;
  readonly name: string;
  readonly species: string;
  readonly city: string;
  readonly place: string;
  readonly placeCode: string;
  readonly guide: boolean;
  readonly common: ThreeSlot;
  readonly poses: readonly string[];
}

export function formsBrief(options: Readonly<Record<string, string>>): Brief {
  const wanted = options['places']?.split(',').map((code) => code.trim());
  const units: GenerationUnit[] = critters
    .filter((critter) => wanted === undefined || wanted.includes(critter.code))
    .map((critter) => {
      const place = places.find((p) => p.code === critter.code);
      const input: FormUnitInput = {
        critterId: critter.id,
        name: critter.name,
        species: critter.species,
        city: critter.city,
        place: place?.name ?? critter.place,
        placeCode: critter.code,
        guide: isGuideSpec(critter.spec),
        common: commonPalette(critter),
        poses: supportedEpicPoses(critter.id),
      };
      return { id: critter.id, input };
    });
  return { units };
}
