/**
 * Deterministic palette candidates, seeded by the form id so a re-run proposes the same colours:
 * rare and epic forms rotate all three slots of the common palette around the OKLCH hue circle
 * (rare and epic draw from different rotations), legendary forms sit in the gold family.
 */
import type { Palette } from '@cp/critter-art';

import { hexToOklch, oklchToHex } from '../../color/color';

export type ThreeSlot = Pick<Palette, 'f' | 'dk' | 'bl'>;

function seeded(id: string): () => number {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const RARE_TURNS = [60, 120, 180, 240, 300];
const EPIC_TURNS = [90, 150, 210, 270, 330];
/** Chroma a near-neutral slot gets so a hue turn actually shows (white egrets, grey pigeons). */
const MIN_CHROMA: Readonly<Record<keyof ThreeSlot, number>> = { f: 0.11, dk: 0.09, bl: 0.04 };

function turnSlot(
  hex: string,
  slot: keyof ThreeSlot,
  degrees: number,
  baseHue: number,
  lift: number,
): string {
  const colour = hexToOklch(hex);
  const neutral = colour.c < 0.05;
  return oklchToHex({
    l: Math.min(0.97, Math.max(0.25, colour.l + lift)),
    c: neutral ? MIN_CHROMA[slot] : colour.c,
    h: ((neutral ? baseHue : colour.h) + degrees + 360) % 360,
  });
}

export function rotatedCandidates(common: ThreeSlot, id: string, epic: boolean): ThreeSlot[] {
  const random = seeded(id);
  const baseHue = random() * 360;
  return (epic ? EPIC_TURNS : RARE_TURNS).flatMap((turn) => {
    const degrees = turn + (random() - 0.5) * 24;
    return [0, -0.08, 0.06].map((lift) => ({
      f: turnSlot(common.f, 'f', degrees, baseHue, lift),
      dk: turnSlot(common.dk, 'dk', degrees, baseHue, lift),
      bl: turnSlot(common.bl, 'bl', degrees * 0.5, baseHue, lift / 2),
    }));
  });
}

/** Gold-family palettes: warm yellow fill, amber shadow, pale cream belly. */
export function goldCandidates(id: string): ThreeSlot[] {
  const random = seeded(`${id}:gold`);
  return Array.from({ length: 12 }, () => {
    const hue = 82 + random() * 16;
    return {
      f: oklchToHex({ l: 0.84 + random() * 0.06, c: 0.14 + random() * 0.04, h: hue }),
      dk: oklchToHex({ l: 0.6 + random() * 0.08, c: 0.11 + random() * 0.03, h: hue - 12 }),
      bl: oklchToHex({ l: 0.95 + random() * 0.03, c: 0.04 + random() * 0.03, h: hue + 6 }),
    };
  });
}

/** Whether a colour sits in the gold family (OKLCH hue 60°–110°, clearly saturated, light). */
export function isGold(hex: string): boolean {
  const { l, c, h } = hexToOklch(hex);
  return h >= 60 && h <= 110 && c >= 0.08 && l >= 0.6;
}
