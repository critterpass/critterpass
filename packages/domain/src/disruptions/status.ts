/**
 * Disruption and watch-list vocabularies (docs/data-model.md §3.12): what a disruption is, what set
 * it off, where it stands, and the forecast watch list's statuses in impact order.
 */
import { z } from 'zod';

export const DISRUPTION_KINDS = [
  'flight_delay',
  'storm',
  'weather',
  'running_late',
  'closure',
] as const;
export const disruptionKindSchema = z.enum(DISRUPTION_KINDS);
export type DisruptionKind = z.infer<typeof disruptionKindSchema>;

export const DISRUPTION_CAUSES = [
  'delay',
  'cancelled',
  'diverted',
  'missed_connection',
  'rough_seas',
  'wind',
  'rain',
  'volcano',
  'crowds',
  'traffic',
  'closure',
  'manual',
] as const;
export const disruptionCauseSchema = z.enum(DISRUPTION_CAUSES);
export type DisruptionCause = z.infer<typeof disruptionCauseSchema>;

export const DISRUPTION_STATUSES = ['open', 'resolved', 'withdrawn', 'undone'] as const;
export const disruptionStatusSchema = z.enum(DISRUPTION_STATUSES);
export type DisruptionStatus = z.infer<typeof disruptionStatusSchema>;

export const WATCH_KINDS = [
  'weather',
  'marine',
  'volcano',
  'crowds',
  'traffic',
  'closure',
] as const;
export const watchKindSchema = z.enum(WATCH_KINDS);
export type WatchKind = z.infer<typeof watchKindSchema>;

/** Watch statuses, least to most plan-changing: `set` = a fix is decided and in place. */
export const WATCH_STATUSES = ['go', 'watching', 'plan_b', 'set'] as const;
export const watchStatusSchema = z.enum(WATCH_STATUSES);
export type WatchStatus = z.infer<typeof watchStatusSchema>;

const WATCH_RANK: Readonly<Record<WatchStatus, number>> = { go: 0, set: 1, watching: 2, plan_b: 3 };

/** Sort weight for the watch list: PLAN B first, then WATCHING, SET, GO. */
export function watchRank(status: WatchStatus): number {
  return WATCH_RANK[status];
}

/** True when moving `from` → `to` newly threatens the plan (the only change that pings). */
export function isPlanChangingEscalation(from: WatchStatus | null, to: WatchStatus): boolean {
  return to === 'plan_b' && from !== 'plan_b' && from !== 'set';
}

export const JOURNEY_MODES = ['drive', 'walk', 'scooter', 'transfer'] as const;
export const journeyModeSchema = z.enum(JOURNEY_MODES);
export type JourneyMode = z.infer<typeof journeyModeSchema>;
