/**
 * Runs one of the app's own commands inside a seed's transaction, as the caller: the payload goes
 * through the command's schema, then `authorize` and `handle` run exactly as the command door runs
 * them. The start scenarios build their trips this way, so a seeded plan, expense or lock is the
 * rows the real command writes, with its events and queued jobs, and never a hand-made copy.
 */
import type { DbCommandDefinition } from '@cp/db';
import { commandClock, generateUuidV7, type CommandContext } from '@cp/domain';
import type pg from 'pg';

/** Who the seed acts as, and the moment every command of one seed sees as now. */
export interface SeedCaller {
  readonly uid: string;
  readonly isAnonymous: boolean;
  readonly now: Date;
}

export const SEED_DEVICE_ID = 'dev-seed';
const SEED_DEVICE_TZ = 'Asia/Ho_Chi_Minh';

export async function playCommand<Payload, Result>(
  tx: pg.PoolClient,
  command: DbCommandDefinition<Payload, Result>,
  payload: unknown,
  who: SeedCaller,
): Promise<Result> {
  const parsed = command.schema.parse(payload);
  const ctx: CommandContext = {
    opId: generateUuidV7(),
    cmd: command.name,
    uid: who.uid,
    isAnonymous: who.isAnonymous,
    via: 'app',
    device: { id: SEED_DEVICE_ID, platform: 'ios', app_version: '1.0.0', tz: SEED_DEVICE_TZ },
    baseVersion: undefined,
    clock: commandClock(who.now.toISOString(), who.now),
  };
  await command.authorize(tx, parsed, ctx);
  return command.handle(tx, parsed, ctx);
}
