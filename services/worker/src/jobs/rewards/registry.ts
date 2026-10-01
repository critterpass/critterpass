/**
 * The rewards registry: what else happens when a find is granted. `reward.fanout` runs every
 * registered handler once per grant, in the grant's transaction, with the one server time all its
 * entries share (a co-presence grant gives the whole crew identical `found_at`). Features register
 * at module load: XP for a form, app-icon unlocks, stamps.
 */
import type pg from 'pg';

export interface GrantedEntry {
  readonly id: string;
  readonly user_id: string;
  readonly form_id: string;
  readonly critter_id: string;
  readonly trip_id: string | null;
  readonly source: 'hatch' | 'encounter' | 'quest' | 'grant';
  /** The form's XP from the catalogue. */
  readonly xp: number;
}

export interface RewardGrant {
  readonly kind: 'critter_found';
  readonly grantedAt: Date;
  readonly entries: readonly GrantedEntry[];
}

export type RewardHandler = (tx: pg.PoolClient, grant: RewardGrant) => Promise<void>;

const handlers = new Map<string, RewardHandler>();

export function registerRewardHandler(name: string, handler: RewardHandler): void {
  if (handlers.has(name)) throw new Error(`reward handler ${name} is already registered`);
  handlers.set(name, handler);
}

export function rewardHandlers(): readonly (readonly [string, RewardHandler])[] {
  return [...handlers.entries()];
}

/** Test-only: forgets every handler. */
export function resetRewardHandlersForTests(): void {
  handlers.clear();
}
