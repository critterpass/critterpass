/**
 * The guide meter's lifecycle (docs/api-contracts.md §5.3: "quota reserved on start, committed on
 * `done`, released on failure/refusal"). The service reserves before the stream opens (so an
 * exhausted free meter is a plain `QUOTA_EXHAUSTED` response) and hands the turn a `MeterHandle`;
 * the turn settles it exactly once, whichever way it ends. Unlimited tiers are not metered but pass
 * the silent fair-use cap, which never errors: over the cap the turn drops to Haiku and short
 * answers, and past that the guide says it is busy.
 */
import type { AiRoute } from '@cp/domain';

import type { UsageSnapshot } from './sse';

export type FairUseLevel = 'ok' | 'degrade_haiku' | 'busy';

export interface MeterReservation {
  /** False for unlimited tiers, system work and crew chat covered by a member's Pass+. */
  readonly metered: boolean;
  readonly fairUse: FairUseLevel;
  /** The meter after this reservation; null when unmetered. */
  readonly usage: UsageSnapshot | null;
}

export interface MeterSettlement {
  readonly usage: UsageSnapshot | null;
}

export interface MeterHandle {
  readonly reservation: MeterReservation;
  /** The answer was delivered: the reserved unit stays spent. */
  commit(): Promise<MeterSettlement>;
  /** The turn failed, was refused or the client left: the unit is given back. */
  release(): Promise<MeterSettlement>;
}

/** Wraps a handle so only the first settle call does anything; later calls repeat its result. */
export function settleOnce(handle: MeterHandle): MeterHandle {
  let settled: Promise<MeterSettlement> | undefined;
  return {
    reservation: handle.reservation,
    commit: () => (settled ??= handle.commit()),
    release: () => (settled ??= handle.release()),
  };
}

/** Guide routes an over-cap unlimited user is moved to (all Haiku). */
const DEGRADED_ROUTE: Partial<Record<AiRoute, AiRoute>> = {
  'guide.chat_escalation': 'guide.chat',
  'guest.guide': 'guide.chat',
};

export function degradedRoute(route: AiRoute): AiRoute {
  return DEGRADED_ROUTE[route] ?? route;
}

/** User-turn instruction added when fair use degrades a turn. */
export const BRIEF_ANSWER_DIRECTIVE = '[Keep this answer to two short sentences.]';
