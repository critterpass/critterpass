/**
 * What a recap contributor sees and adds to. The builder loads the trip and its travellers, then
 * hands each registered contributor, in order, the same draft to fill: one reads the plan, one the
 * rides, one the ledger, and so on. A contributor only ever reads its own area's tables, through the
 * builder's transaction, and never a location fix or sample: routes come from plan stops and logged
 * rides, visits from the detected-visit table.
 */
import type {
  MemberAwardDetail,
  MemberMetrics,
  RecapCritters,
  RecapGotAway,
  RecapReceipt,
  RecapRoute,
  RecapStats,
  RecapSuperlative,
} from '@cp/domain';
import type pg from 'pg';

import type { MeetupRouter } from '../../live-map/meetup-router';

export interface RecapTrip {
  readonly id: string;
  readonly crewId: string;
  readonly destinationId: string | null;
  /** The trip's clock: its own zone, else its destination's, else UTC. */
  readonly tz: string;
  readonly startDate: string;
  /** The last day the trip covered (its end date, or the day it was cut short). */
  readonly endedOn: string;
  readonly currentVersionId: string | null;
  /** The crew's settlement currency, the ledger's and the receipt's. */
  readonly currency: string;
}

export interface RecapScope {
  readonly trip: RecapTrip;
  /** Everyone who was IN at any point, sorted by user id. */
  readonly members: readonly string[];
}

export interface RecapDeps {
  /** Road distances between stops; the straight-line router when no routing engine is set. */
  readonly router: MeetupRouter;
}

/** The draft every contributor fills; the builder turns it into the recap's columns. */
export interface RecapDraft {
  route: RecapRoute;
  receipt: RecapReceipt | null;
  critters: RecapCritters;
  gotAway: RecapGotAway | null;
  superlatives: RecapSuperlative[];
  photos: RecapStats['photos'];
  /** Per traveller: the counts awards are chosen on. */
  readonly metrics: Map<string, MemberMetrics>;
  /** Per traveller: the extra facts an award line may quote. */
  readonly details: Map<string, MemberAwardDetail>;
  /** Moments per local date, for the best day. */
  readonly dayScores: Map<string, number>;
}

export interface RecapContributor {
  /** Stable name, for logs and the registry. */
  readonly name: string;
  contribute(
    tx: pg.PoolClient,
    scope: RecapScope,
    draft: RecapDraft,
    deps: RecapDeps,
  ): Promise<void>;
}

/** Adds `amount` to one traveller's metric. */
export function addMetric(
  draft: RecapDraft,
  userId: string,
  metric: keyof MemberMetrics,
  amount: number,
): void {
  const metrics = draft.metrics.get(userId) ?? {};
  metrics[metric] = (metrics[metric] ?? 0) + amount;
  draft.metrics.set(userId, metrics);
}

/** Merges facts into one traveller's award details. */
export function addDetail(draft: RecapDraft, userId: string, detail: MemberAwardDetail): void {
  draft.details.set(userId, { ...draft.details.get(userId), ...detail });
}

/** Adds `amount` moments to a local date. */
export function addDayScore(draft: RecapDraft, localDate: string, amount: number): void {
  draft.dayScores.set(localDate, (draft.dayScores.get(localDate) ?? 0) + amount);
}

/** The trip day (1-based) of a local date. */
export function dayNoOf(trip: RecapTrip, localDate: string): number {
  return Math.round((Date.parse(localDate) - Date.parse(trip.startDate)) / 86_400_000) + 1;
}
