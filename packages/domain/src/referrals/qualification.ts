/**
 * Referral qualification. Attribution goes to the first valid invite link or code a new account
 * came through (every invite carries its inviter). A referral qualifies once the referee is a
 * genuinely new person (a verified phone, Apple or Google identity nobody else holds, on an
 * attested device) who then either joined a crew and voted, or created a trip. Fraud rules
 * (./fraud.ts) can void it at any point before the reward.
 */
import { z } from 'zod';

export const REFERRAL_STATUSES = ['pending', 'joined', 'qualified', 'void'] as const;
export const referralStatusSchema = z.enum(REFERRAL_STATUSES);
export type ReferralStatus = z.infer<typeof referralStatusSchema>;

export const REFERRAL_VIAS = ['invite', 'code', 'referral_link'] as const;
export type ReferralVia = (typeof REFERRAL_VIAS)[number];

/** An account older than this when it follows a link is not a new referee. */
export const REFERRAL_NEW_ACCOUNT_DAYS = 7;

export interface AttributionFacts {
  readonly referrerId: string;
  readonly refereeId: string;
  readonly refereeCreatedAt: Date;
  /** The referee already has a referral (attribution is first-link-wins). */
  readonly refereeAlreadyReferred: boolean;
  readonly now: Date;
}

/** Whether this link or code may become the referee's referral. */
export function canAttributeReferral(facts: AttributionFacts): boolean {
  if (facts.referrerId === facts.refereeId || facts.refereeAlreadyReferred) return false;
  const ageMs = facts.now.getTime() - facts.refereeCreatedAt.getTime();
  return ageMs <= REFERRAL_NEW_ACCOUNT_DAYS * 86_400_000;
}

export interface QualificationFacts {
  /** A verified phone, Apple or Google identity. */
  readonly identityVerified: boolean;
  /** That identity already belongs to (or belonged to) another account. */
  readonly identitySeenBefore: boolean;
  /** At least one of the referee's devices passed App Attest / Play Integrity. */
  readonly deviceAttested: boolean;
  readonly joinedCrew: boolean;
  readonly voted: boolean;
  readonly createdTrip: boolean;
}

export type QualificationOutcome =
  | { readonly kind: 'qualified' }
  | { readonly kind: 'joined' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'not_new' };

/** Where a referral stands given what the referee has done so far. */
export function evaluateQualification(facts: QualificationFacts): QualificationOutcome {
  if (facts.identitySeenBefore) return { kind: 'not_new' };
  const active = (facts.joinedCrew && facts.voted) || facts.createdTrip;
  if (active && facts.identityVerified && facts.deviceAttested) return { kind: 'qualified' };
  if (facts.joinedCrew || facts.createdTrip) return { kind: 'joined' };
  return { kind: 'pending' };
}
