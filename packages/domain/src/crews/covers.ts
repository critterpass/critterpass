/**
 * Crew pass covers: the colour of the little book a crew's pass is drawn on. Six are free; the
 * referral covers (Navy at 3 referral stamps, Collector at 5) are earned by the person who picks
 * them, so a crew wears one only when someone who unlocked it chose it.
 */
import { z } from 'zod';

import { coversUnlocked, REFERRAL_COVERS, type ReferralCover } from '../referrals/rewards';

export const FREE_CREW_COVERS = ['tangerine', 'sky', 'mint', 'pink', 'sun', 'ink'] as const;
export type FreeCrewCover = (typeof FREE_CREW_COVERS)[number];

export const CREW_COVERS = [...FREE_CREW_COVERS, 'navy', 'collector'] as const;
export type CrewCover = FreeCrewCover | ReferralCover;

export const crewCoverSchema = z.enum(CREW_COVERS);

/** The cover a crew without one is drawn with. */
export const DEFAULT_CREW_COVER: FreeCrewCover = 'tangerine';

const EARNED: readonly string[] = REFERRAL_COVERS.map((entry) => entry.cover);

export function isEarnedCrewCover(cover: CrewCover): cover is ReferralCover {
  return EARNED.includes(cover);
}

/** Whether someone holding `referralStamps` may put `cover` on a crew. */
export function crewCoverAllowed(cover: CrewCover, referralStamps: number): boolean {
  if (!isEarnedCrewCover(cover)) return true;
  return coversUnlocked(referralStamps).includes(cover);
}

/** A stored value read back: unknown or missing covers fall back to the default. */
export function parseCrewCover(value: string | null | undefined): CrewCover {
  const parsed = crewCoverSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_CREW_COVER;
}
