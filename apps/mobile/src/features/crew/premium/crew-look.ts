/**
 * How a crew and its people are drawn in the premium UI: the pass cover's colour (and whether the
 * pass ink flips dark on a light cover), which covers the picker offers locked, and each member's
 * crew colour as a premium accent.
 */
/* eslint-disable lingui/no-unlocalized-strings -- colour values and enum keys, never copy. */
import { premium } from '@cp/design-tokens';
import {
  CREW_COVERS,
  crewCoverAllowed,
  isEarnedCrewCover,
  parseCrewCover,
  parseMemberColour,
  type CrewCover,
} from '@cp/domain';

const ACCENT = premium.accent;
const LIGHT = premium.modes.light.color;

/**
 * The reward books (Navy at three referral stamps, Collector at five) have no premium token yet:
 * their fills are the referral covers' own art colours, kept here until the kit carries them.
 */
// eslint-disable-next-line critterpass/no-literal-style -- referral cover art, pending a kit token.
const NAVY = '#1f2a52';
// eslint-disable-next-line critterpass/no-literal-style -- referral cover art, pending a kit token.
const COLLECTOR = '#c8901a';

/** The cover fills. The six free ones are the design's swatches; the earned ones the reward books. */
export const COVER_FILL: Readonly<Record<CrewCover, string>> = {
  tangerine: ACCENT.tangerine,
  sky: ACCENT.sky,
  mint: ACCENT.mint,
  pink: ACCENT.pink,
  sun: ACCENT.sun,
  ink: LIGHT.ink,
  navy: NAVY,
  collector: COLLECTOR,
};

/** Cream pass ink on a dark cover; on-accent ink on a light one (sun, mint). */
const CREAM_INK = LIGHT.status.maybe.bg;
const DARK_INK = LIGHT.onAccent;

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export interface PassInk {
  readonly fill: string;
  /** Text, crest ring and frame. */
  readonly ink: string;
  readonly light: boolean;
}

export function passInk(cover: CrewCover): PassInk {
  const fill = COVER_FILL[cover];
  const light = luminance(fill) > 0.5;
  return {
    fill,
    light,
    ink: light ? DARK_INK : CREAM_INK,
  };
}

export interface CoverOption {
  readonly cover: CrewCover;
  readonly fill: string;
  /** An earned cover the person picking has not unlocked: shown, not pickable. */
  readonly locked: boolean;
  readonly earned: boolean;
}

/** Every cover in picker order, the earned ones locked unless `referralStamps` unlock them. */
export function coverOptions(referralStamps: number): readonly CoverOption[] {
  return CREW_COVERS.map((cover) => ({
    cover,
    fill: COVER_FILL[cover],
    earned: isEarnedCrewCover(cover),
    locked: !crewCoverAllowed(cover, referralStamps),
  }));
}

/** A stored cover read back (unknown or missing → the default). */
export function crewCoverOf(value: string | null | undefined): CrewCover {
  return parseCrewCover(value);
}

const MEMBER_ACCENT: Readonly<Record<string, string>> = {
  yellow: ACCENT.sun,
  orange: ACCENT.tangerine,
  blue: ACCENT.sky,
  pink: ACCENT.pink,
  green: ACCENT.mint,
  cream: ACCENT.neutral,
  red: ACCENT.pink,
};

/** A member's crew colour (`crew_members.colour`) as the premium accent; neutral when unset. */
export function memberAccent(colour: string | null | undefined): string {
  const parsed = parseMemberColour(colour ?? null);
  return parsed === null ? ACCENT.neutral : (MEMBER_ACCENT[parsed.accent] ?? ACCENT.neutral);
}
