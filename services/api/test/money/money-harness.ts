/**
 * The real stack for the money suites: the setup harness (Testcontainers Postgres + Redis, Better
 * Auth sessions, the command doors) with the money commands registered, a crew of six on a trip
 * they all take part in, and the FX run the design's numbers use (15,835 IDR and 1.35 SGD a dollar).
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';

import type { CommandRegistry } from '../../src/commands/_framework/registry';
import { registerMoneyCommands } from '../../src/commands/money';
import {
  buildSetupCrew,
  startSetupHarness,
  type MountSetup,
  type SetupCrew,
  type SetupHarness,
} from '../setup/setup-harness';

export type MoneyHarness = SetupHarness;

export function startMoneyHarness(
  extra?: (registry: CommandRegistry) => void,
  mount?: MountSetup,
): Promise<MoneyHarness> {
  return startSetupHarness((registry) => {
    registerMoneyCommands(registry);
    extra?.(registry);
  }, mount);
}

export interface MoneyCrew extends SetupCrew {
  /** The IDR snapshot of the design's FX run. */
  readonly idrSnapshotId: string;
}

/** A crew of `size` who all take part in the trip, and the FX run the suites convert at. */
export async function buildMoneyCrew(harness: MoneyHarness, size: number): Promise<MoneyCrew> {
  const crew = await buildSetupCrew(harness, size);
  const source = `test-${generateUuidV7().slice(-12)}`;
  const idrSnapshotId = await withSystem(harness.pool, async (tx) => {
    for (const member of crew.members.slice(1)) {
      await tx.query(
        "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'in')",
        [crew.tripId, member.uid],
      );
    }
    await tx.query(
      `INSERT INTO fx_snapshots (base, quote, rate, as_of, source)
       VALUES ('USD', 'SGD', 1.35, '2026-10-14', $1)`,
      [source],
    );
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO fx_snapshots (base, quote, rate, as_of, source)
       VALUES ('USD', 'IDR', 15835, '2026-10-14', $1) RETURNING id`,
      [source],
    );
    return rows[0]!.id;
  });
  return { ...crew, idrSnapshotId };
}

/** Each member's net in the crew's ledger, per currency. */
export async function netsOf(
  harness: MoneyHarness,
  crewId: string,
): Promise<Record<string, Record<string, number>>> {
  const { rows } = await harness.pool.query<{ user_id: string; currency: string; net: string }>(
    `SELECT user_id, currency, net_minor::text AS net FROM member_balances
      WHERE crew_id = $1 AND net_minor <> 0`,
    [crewId],
  );
  const nets: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    nets[row.currency] ??= {};
    nets[row.currency]![row.user_id] = Number(row.net);
  }
  return nets;
}
