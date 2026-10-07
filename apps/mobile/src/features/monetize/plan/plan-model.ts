/**
 * What "Your plan" says, from the synced subscription rows and the server's resolved Pass+ flag.
 * Pure: the rows decide the wording, the Pass+ flag alone decides whether Pass+ is on. Dates come
 * from the server's rows only (the period end, the grace end, the resume date); nothing here
 * knows about a card or why a payment failed.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, SQL and Intl options, never copy. */
import type { BillingPlatform, StorePlatform, SubscriptionState } from '@cp/domain';

import type { Subscription } from '../data/billing-rows';

export type PlanKind =
  | 'free'
  /** Renewing. */
  | 'active'
  /** Auto-renew is off: Pass+ runs to the period end. */
  | 'cancelled'
  /** A renewal failed; Pass+ stays on until the grace end. */
  | 'grace'
  /** A renewal failed and the grace is over: Pass+ is off until the payment goes through. */
  | 'payment_failed'
  | 'paused'
  /** A subscription that ran out, with no Pass+ from anywhere else. */
  | 'expired'
  /** Pass+ from a gift, a code, first trip free or a crew's yearly boost: no store row to manage. */
  | 'granted';

export type PlanPeriod = 'monthly' | 'yearly';

export interface PlanModel {
  readonly kind: PlanKind;
  /** The server's answer, whatever the rows above say. */
  readonly passPlus: boolean;
  readonly period: PlanPeriod | null;
  /** Renews on (active), ends on (cancelled, granted), stays on until (grace), resumes (paused). */
  readonly date: string | null;
  /** The store that bills it; null for a grant or no plan. */
  readonly platform: StorePlatform | null;
  /** Billed by the store on this phone, so its sheets can manage it. */
  readonly manageHere: boolean;
  /** Pausing is offered for a renewing monthly plan only: a year is already paid. */
  readonly canPause: boolean;
  readonly canCancel: boolean;
  /** A failed renewal that needs the person: grace or payment failed. */
  readonly hasIssue: boolean;
}

/** Which of several rows describes the plan: a live one beats a lapsed one. */
const RANK: Readonly<Record<SubscriptionState, number>> = {
  active: 0,
  cancelled_active: 1,
  grace: 2,
  billing_retry: 3,
  on_hold: 3,
  paused: 4,
  expired: 5,
  revoked: 6,
};

const STORES: readonly BillingPlatform[] = ['app_store', 'play'];

function isPass(subscription: Subscription): boolean {
  return subscription.productKey === 'pass_monthly' || subscription.productKey === 'pass_yearly';
}

const NONE = {
  period: null,
  date: null,
  platform: null,
  manageHere: false,
  canPause: false,
  canCancel: false,
  hasIssue: false,
} as const;

export interface PlanInput {
  /** Newest first. */
  readonly subscriptions: readonly Subscription[];
  readonly passPlus: boolean;
  readonly passPlusUntil: string | null;
  /** The store on this phone; null where there is none. */
  readonly deviceStore: StorePlatform | null;
}

export function planModel(input: PlanInput): PlanModel {
  const { passPlus } = input;
  const main = input.subscriptions
    .filter((subscription) => isPass(subscription) && STORES.includes(subscription.platform))
    .sort((a, b) => RANK[a.status] - RANK[b.status])[0];

  if (main === undefined || main.status === 'expired' || main.status === 'revoked') {
    if (passPlus) return { ...NONE, kind: 'granted', passPlus, date: input.passPlusUntil };
    return { ...NONE, kind: main?.status === 'expired' ? 'expired' : 'free', passPlus };
  }

  const platform = main.platform as StorePlatform;
  const period: PlanPeriod = main.productKey === 'pass_yearly' ? 'yearly' : 'monthly';
  const manageHere = platform === input.deviceStore;
  const base = { passPlus, period, platform, manageHere };
  switch (main.status) {
    case 'active':
      if (!main.autoRenew) {
        return { ...NONE, ...base, kind: 'cancelled', date: main.periodEnd };
      }
      return {
        ...base,
        kind: 'active',
        date: main.periodEnd,
        canPause: period === 'monthly',
        canCancel: true,
        hasIssue: false,
      };
    case 'cancelled_active':
      return { ...NONE, ...base, kind: 'cancelled', date: main.periodEnd };
    case 'grace':
      return {
        ...base,
        kind: 'grace',
        date: main.graceEndsAt,
        canPause: false,
        canCancel: true,
        hasIssue: true,
      };
    case 'billing_retry':
    case 'on_hold':
      return {
        ...base,
        kind: 'payment_failed',
        date: null,
        canPause: false,
        canCancel: true,
        hasIssue: true,
      };
    case 'paused':
      return { ...NONE, ...base, kind: 'paused', date: main.resumeAt };
  }
}

export interface BoostLine {
  readonly id: string;
  readonly tripId: string;
  readonly destination: string;
  readonly crew: string;
  readonly source: 'purchase' | 'first_trip_free' | 'crew_year' | 'other';
  readonly on: boolean;
  readonly endsAt: string | null;
}

export interface BoostLineRow {
  readonly id: string;
  readonly trip_id: string;
  readonly source: string;
  readonly status: string;
  readonly ends_at: string | null;
  readonly destination: string | null;
  readonly crew: string | null;
}

/** The boosts of the person's trips, running ones first. */
export function boostLines(rows: readonly BoostLineRow[]): BoostLine[] {
  return rows
    .map((row): BoostLine => ({
      id: row.id,
      tripId: row.trip_id,
      destination: row.destination ?? '',
      crew: row.crew ?? '',
      source:
        row.source === 'purchase' || row.source === 'first_trip_free' || row.source === 'crew_year'
          ? row.source
          : 'other',
      on: row.status === 'active' || row.status === 'scheduled',
      endsAt: row.ends_at,
    }))
    .sort((a, b) => Number(b.on) - Number(a.on));
}

/**
 * When a pause before a trip ends: a month before the trip starts, so Pass+ is back for the
 * run-up. Null when that is not in the future (the trip is too close to pause for).
 */
export function pauseResumeDate(tripStart: Date, now: Date): Date | null {
  const resume = new Date(tripStart.getTime());
  resume.setUTCMonth(resume.getUTCMonth() - 1);
  // 31 March has no 31 February: stay in the month before rather than spilling into the trip's.
  if (resume.getUTCDate() !== tripStart.getUTCDate()) resume.setUTCDate(0);
  return resume.getTime() > now.getTime() ? resume : null;
}
