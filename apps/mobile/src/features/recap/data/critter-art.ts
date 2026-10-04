/**
 * How a recap draws a catalogue critter: the renderer's kind for its key (guides draw from their
 * named kind), a form row's render spec, and the guide a critter is, if it is one (a guide's name
 * is known to everyone; any other critter's only from the viewer's own find).
 */
import {
  critters,
  isGuideSpec,
  type EdgeStyle,
  type FormSpec,
  type Palette,
  type Pose,
} from '@cp/critter-art';

import type { FormRow } from './recap-rows';

const KIND_BY_KEY = new Map(critters.map((critter) => [critter.id, critter.kind]));
/** The guides everyone has met: the critters drawn by hand. */
const HAND_DRAWN_NAMES = new Map(
  critters
    .filter((critter) => isGuideSpec(critter.spec))
    .map((critter) => [critter.id, critter.name]),
);

/** The renderer's kind for a catalogue critter (guides draw from their named kind). */
export function artKind(key: string): string {
  return KIND_BY_KEY.get(key) ?? key;
}

export function formSpec(row: FormRow): FormSpec | null {
  try {
    const palette = JSON.parse(row.palette ?? 'null') as Palette | null;
    if (palette === null || typeof palette !== 'object') return null;
    const base = {
      rarity: row.rarity as FormSpec['rarity'],
      palette,
      edge: (row.edge ?? 'none') as EdgeStyle,
    };
    return row.pose === null ? base : { ...base, pose: row.pose as Pose };
  } catch {
    return null;
  }
}

/** The guide whose critter this is ("Tokek" for the Tokay gecko), or null. */
export function guideNameOf(critterKey: string): string | null {
  return HAND_DRAWN_NAMES.get(critterKey) ?? null;
}
