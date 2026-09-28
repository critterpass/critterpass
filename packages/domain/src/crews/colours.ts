/**
 * Member colours: each crew hands out the six guide accents in join order; members 7–12 repeat the
 * accents with a dashed ring and 13–16 with a double ring, so up to 16 people stay distinguishable.
 * A departed member's slot is reused by the next joiner, lowest slot first.
 *
 * Stored in `crew_members.colour` as `accent` (solid ring) or `accent/ring`, e.g. `blue/dashed`.
 */
import { GUIDE_COLOURS, type GuideColour } from '../enums/catalogue';

import { CREW_MEMBER_CEILING } from './limits';

export const MEMBER_RING_PATTERNS = ['solid', 'dashed', 'double'] as const;
export type MemberRingPattern = (typeof MEMBER_RING_PATTERNS)[number];

export interface MemberColour {
  readonly accent: GuideColour;
  readonly ring: MemberRingPattern;
}

/** Slot 0-based in join order. */
export function memberColourForSlot(slot: number): MemberColour {
  if (!Number.isInteger(slot) || slot < 0 || slot >= CREW_MEMBER_CEILING) {
    throw new RangeError(`member colour slot ${slot} is outside 0..${CREW_MEMBER_CEILING - 1}`);
  }
  const accents = GUIDE_COLOURS.length;
  const accent = GUIDE_COLOURS[slot % accents] as GuideColour;
  const ring = MEMBER_RING_PATTERNS[Math.min(Math.floor(slot / accents), 2)] as MemberRingPattern;
  return { accent, ring };
}

export function encodeMemberColour(colour: MemberColour): string {
  return colour.ring === 'solid' ? colour.accent : `${colour.accent}/${colour.ring}`;
}

export function parseMemberColour(stored: string | null): MemberColour | null {
  if (stored === null) return null;
  const [accent, ring = 'solid'] = stored.split('/');
  if (!(GUIDE_COLOURS as readonly string[]).includes(accent ?? '')) return null;
  if (!(MEMBER_RING_PATTERNS as readonly string[]).includes(ring)) return null;
  return { accent: accent as GuideColour, ring: ring as MemberRingPattern };
}

/** The encoded colour of the lowest slot no active member holds. */
export function nextMemberColour(takenByActiveMembers: readonly (string | null)[]): string {
  const taken = new Set(takenByActiveMembers);
  for (let slot = 0; slot < CREW_MEMBER_CEILING; slot += 1) {
    const encoded = encodeMemberColour(memberColourForSlot(slot));
    if (!taken.has(encoded)) return encoded;
  }
  // A full crew cannot take a joiner; a legacy crew past the ceiling reuses the last slot.
  return encodeMemberColour(memberColourForSlot(CREW_MEMBER_CEILING - 1));
}
