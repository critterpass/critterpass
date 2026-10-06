/**
 * The crew's pick of a driver as a change set: the op "Ask the crew first" drafts (the driver on
 * the picked days, with the terms voted on when there is a quote), a driver's quote as those
 * terms, and what a refused pick means
 * (the driver is gone, a day is listed twice, a day went to another driver, the plan moved on).
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values and error codes, never copy. */
import {
  ASSIGN_PROVIDER_OP,
  agreedTermsSchema,
  type AgreedTerms,
  type ChangeSetOp,
  type CreateChangesetPayload,
} from '@cp/domain';
import type { PickDay } from '@cp/planner';

import type { SendResult } from '@/data/commands/client';

/** Why the crew is asked, as the change set's reason key. */
export const DRIVER_PICK_REASON = 'driver_pick';

/** The `assign_provider` op for the picked dates; TAKEN days never go in. Null with no day left. */
export function crewPickOp(
  providerId: string,
  days: readonly PickDay[],
  picked: ReadonlySet<string>,
  terms?: AgreedTerms,
): ChangeSetOp | null {
  const chosen = days.filter((day) => picked.has(day.date) && !day.taken);
  if (chosen.length === 0) return null;
  return {
    op: ASSIGN_PROVIDER_OP,
    target: providerId,
    assignment: {
      days: chosen.map((day) => ({
        date: day.date,
        window_start: day.window?.start ?? null,
        window_end: day.window?.end ?? null,
        pickup: day.pickup,
      })),
      ...(terms === undefined ? {} : { terms }),
    },
    reason: DRIVER_PICK_REASON,
    affected_user_ids: [],
    booking_impact: false,
  };
}

/** A driver's quote as his link's reply carries it. */
export interface DriverQuote {
  readonly price_per_day_minor: number | null;
  readonly currency: string | null;
  readonly includes: readonly string[];
  readonly overtime_per_hour_minor: number | null;
  readonly included_hours: number | null;
}

/**
 * The quote as the terms the crew votes on: his price a day, the hours it covers, overtime an
 * hour, and what he said it includes (what he did not tick stays unknown, never a no). Null when
 * he gave no price.
 */
export function quoteTerms(quote: DriverQuote): AgreedTerms | null {
  if (quote.price_per_day_minor === null || quote.price_per_day_minor < 0) return null;
  const said = new Set(quote.includes);
  const included = (key: string) => (said.has(key) ? 'yes' : 'unknown');
  const hours = quote.included_hours;
  const terms = agreedTermsSchema.safeParse({
    price_minor: quote.price_per_day_minor,
    currency: quote.currency,
    price_unit: 'day',
    included_hours: hours !== null && hours > 0 && hours <= 24 ? hours : null,
    includes: {
      fuel: included('petrol'),
      parking: included('parking'),
      tolls: included('tolls'),
      entry: included('entry_tickets'),
    },
    overtime_minor: quote.overtime_per_hour_minor,
  });
  return terms.success ? terms.data : null;
}

export function crewPickChangeset(input: {
  readonly changesetId: string;
  readonly tripId: string;
  readonly baseVersion: string;
  readonly op: ChangeSetOp;
}): CreateChangesetPayload {
  return {
    changeset_id: input.changesetId,
    trip_id: input.tripId,
    base_version: input.baseVersion,
    ops: [input.op],
    source: 'user',
    trigger: 'manual',
  };
}

export type PickError =
  | { readonly kind: 'needs_signal' }
  | { readonly kind: 'driver_gone' }
  | { readonly kind: 'days' }
  | { readonly kind: 'day_taken'; readonly dates: readonly string[] }
  | { readonly kind: 'plan_moved' }
  | { readonly kind: 'failed' };

const DATE = /^\d{4}-\d{2}-\d{2}$/u;

/** What went wrong with a pick (set directly or put to the crew); null when it went through. */
export function pickErrorOf(result: SendResult): PickError | null {
  if (result.kind === 'applied' || result.kind === 'queued') return null;
  if (result.kind === 'unavailable') return { kind: 'needs_signal' };
  const detail =
    typeof result.detail === 'object' && result.detail !== null
      ? (result.detail as { reason?: unknown; dates?: unknown })
      : {};
  if (result.code === 'NOT_FOUND' && detail.reason === 'provider') return { kind: 'driver_gone' };
  if (result.code === 'VALIDATION' && detail.reason === 'days') return { kind: 'days' };
  if (result.code === 'STATE_INVALID' && detail.reason === 'day_taken') {
    const dates = Array.isArray(detail.dates)
      ? detail.dates.filter((date): date is string => typeof date === 'string' && DATE.test(date))
      : [];
    return { kind: 'day_taken', dates };
  }
  if (result.code === 'PLAN_VERSION_CONFLICT') return { kind: 'plan_moved' };
  return { kind: 'failed' };
}
