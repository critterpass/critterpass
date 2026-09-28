/**
 * Referral rewards: each qualified referral gives the referrer and the referee one referral stamp.
 * Referral stamps unlock pass covers at 3 (Navy) and 5 (Collector); stamps past 5 still count but
 * unlock nothing more.
 */

export const REFERRAL_COVERS = [
  { stamps: 3, cover: 'navy' },
  { stamps: 5, cover: 'collector' },
] as const;
export type ReferralCover = (typeof REFERRAL_COVERS)[number]['cover'];

/** The dashboard's stamp slots. */
export const REFERRAL_STAMP_SLOTS = 5;

export function coversUnlocked(referralStamps: number): readonly ReferralCover[] {
  return REFERRAL_COVERS.filter((entry) => referralStamps >= entry.stamps).map((e) => e.cover);
}

/** The cover a new stamp unlocks, if this stamp crosses a threshold. */
export function coverUnlockedBy(stampsBefore: number, stampsAfter: number): ReferralCover | null {
  const entry = REFERRAL_COVERS.find((e) => stampsBefore < e.stamps && stampsAfter >= e.stamps);
  return entry?.cover ?? null;
}

/** Both sides of a qualified referral are stamped, each once. */
export function referralRewardRecipients(referral: {
  readonly referrerId: string;
  readonly refereeId: string;
}): readonly string[] {
  return [referral.referrerId, referral.refereeId];
}
