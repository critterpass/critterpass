/**
 * Running late (3k-9): the thresholds a journey check is judged by, the two-check hysteresis that
 * keeps an ETA flapping around the threshold from opening or closing anything, the options stored
 * on `disruptions.options`, and the line the waiting crew gets the moment an option is chosen.
 */
import { z } from 'zod';

import { lateOptionKindSchema, type LateOptionKind } from './commands';

/** An ETA this many minutes past the item's start counts as late. */
export const LATE_THRESHOLD_MIN = 10;
/** An ETA within this many minutes of the start counts as on time again. */
export const ON_TIME_MIN = 3;
/** Checks in a row before a journey opens or resolves a running-late disruption. */
export const LATE_STREAK_CHECKS = 2;
/** A journey whose checks stopped for this long shows its last ETA as stale. */
export const JOURNEY_STALE_MIN = 3;
export const JOURNEY_CHECK_TTL_HOURS = 24;

export interface JourneyStreaks {
  readonly lateStreak: number;
  readonly onTimeStreak: number;
}

const STREAK_MAX = 1000;

/** The streaks after one more check: late and on-time runs reset each other, and so does the gap. */
export function nextJourneyStreaks(previous: JourneyStreaks, lateMin: number): JourneyStreaks {
  if (lateMin >= LATE_THRESHOLD_MIN) {
    return { lateStreak: Math.min(previous.lateStreak + 1, STREAK_MAX), onTimeStreak: 0 };
  }
  if (lateMin <= ON_TIME_MIN) {
    return { lateStreak: 0, onTimeStreak: Math.min(previous.onTimeStreak + 1, STREAK_MAX) };
  }
  return { lateStreak: 0, onTimeStreak: 0 };
}

export const LATE_SUPPLIER_EFFECTS = ['none', 'viator_cancel', 'partner_link'] as const;
export type LateSupplierEffect = (typeof LATE_SUPPLIER_EFFECTS)[number];

/** One option on 3k-9. Every time and amount is worked out in code (packages/planner). */
export const lateOptionSchema = z.object({
  id: lateOptionKindSchema,
  label: z.string().max(80),
  detail: z.string().max(160),
  offered: z.boolean(),
  recommended: z.boolean(),
  /** The on-time members start as planned and the late ones join: the plan itself stays. */
  split: z.boolean(),
  new_start: z.iso.datetime({ offset: true }).nullable(),
  arrive_at: z.iso.datetime({ offset: true }).nullable(),
  /** Each late member's change in minor units (negative = money back); null when unknown. */
  per_person_minor: z.number().int().nullable(),
  currency: z.string().nullable(),
  supplier: z.enum(LATE_SUPPLIER_EFFECTS),
  /** Who a message would go to. Their answer lives on the disruption's own message row. */
  vendor_name: z.string().max(80).nullable(),
  facts: z.record(z.string(), z.union([z.string().max(120), z.number()])),
});
export type LateOption = z.infer<typeof lateOptionSchema>;
export const lateOptionsSchema = z.array(lateOptionSchema).max(4);

/** "Wes", "Wes and Jordan", "Wes, Jordan and Rin". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? 'Someone';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

export interface WaitingLineFacts {
  readonly names: readonly string[];
  readonly minutes: number;
  readonly title: string;
  /** Local wall-clock arrival, already formatted; null when not known. */
  readonly arrive: string | null;
}

/**
 * What the crew waiting at the item reads in chat when a late member picks an option; a changed
 * pick says so ("Update: …").
 */
export function waitingCrewLine(
  option: LateOptionKind,
  facts: WaitingLineFacts,
  correction: boolean,
): string {
  const who = joinNames(facts.names);
  const many = facts.names.length > 1;
  const verb = many ? 'are' : 'is';
  let line: string;
  switch (option) {
    case 'push':
      line = `${who} ${verb} ${facts.minutes} min late for ${facts.title}. Start without ${many ? 'them' : 'waiting'}.`;
      break;
    case 'walk':
      line =
        facts.arrive === null
          ? `${who} ${verb} walking the last bit to ${facts.title}.`
          : `${who} ${verb} walking the last bit to ${facts.title}, there about ${facts.arrive}.`;
      break;
    case 'skip':
      line = `${who} ${verb} skipping ${facts.title}. Go ahead.`;
      break;
    case 'car':
      line = `${who} ${verb} ${facts.minutes} min late and getting a car to ${facts.title}.`;
      break;
  }
  return correction ? `Update: ${line}` : line;
}
