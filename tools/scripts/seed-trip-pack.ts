/**
 * One simulated traveller changes the crew's shared pack list through the real api, the way a
 * crewmate's phone would: they join the crew behind `--code` (which puts them on its trip), read
 * the trip from sync, then either add a shared item (`--action add`) or take the one with that
 * label off the list (`--action remove`). The offline flows use the pair to make a write the
 * device queued without signal arrive after the item is gone.
 *
 *   pnpm tsx tools/scripts/seed-trip-pack.ts --api https://api-staging-de92.up.railway.app \
 *       --code K7M2QX --action add --label Torch
 *
 * Prints one JSON line: `{"action": …, "label": …, "item_id": …, "trip_id": …}`.
 */
import { parseArgs } from 'node:util';

import { readSyncedRows, waitForSyncedRow } from './seed-sync-rows';
import { joinTraveller, sendCommand, uuidV7, type ApiClient } from './seed-trip-day';

export type PackAction = 'add' | 'remove';

export interface PackChange {
  readonly action: PackAction;
  readonly label: string;
  readonly item_id: string;
  readonly trip_id: string;
}

export async function changeSharedPack(
  api: ApiClient,
  code: string,
  action: PackAction,
  label: string,
): Promise<PackChange> {
  const traveller = await joinTraveller(api, action === 'add' ? 'Pat Sim' : 'Kit Sim', code);
  const trip = await waitForSyncedRow(
    () => readSyncedRows(api, traveller, 'trips'),
    (rows) => rows.find((row) => row['status'] === 'in_trip') ?? rows[0],
    'the trip',
  );
  if (action === 'add') {
    const itemId = uuidV7();
    await sendCommand(api, traveller, 'add_packing_item', {
      item_id: itemId,
      trip_id: trip.id,
      label,
      personal: false,
    });
    return { action, label, item_id: itemId, trip_id: trip.id };
  }
  const item = await waitForSyncedRow(
    () =>
      readSyncedRows(api, traveller, 'packing_items', {
        subscriptions: [{ stream: 'trip', parameters: { trip_id: trip.id } }],
      }),
    (rows) =>
      rows.find(
        (row) => row['label'] === label && row['owner_id'] == null && row['deleted_at'] == null,
      ),
    `the shared item ${label}`,
  );
  await sendCommand(api, traveller, 'remove_packing_item', { item_id: item.id });
  return { action, label, item_id: item.id, trip_id: trip.id };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      api: { type: 'string' },
      code: { type: 'string' },
      action: { type: 'string' },
      label: { type: 'string' },
    },
  });
  const { api: baseUrl, code, action, label } = values;
  if (
    baseUrl === undefined ||
    code === undefined ||
    label === undefined ||
    (action !== 'add' && action !== 'remove')
  ) {
    throw new Error(
      'usage: seed-trip-pack.ts --api <url> --code <crew code> --action add|remove --label <item>',
    );
  }
  const api: ApiClient = { baseUrl: baseUrl.replace(/\/$/, ''), fetch };
  const change = await changeSharedPack(api, code.toUpperCase(), action, label);
  process.stdout.write(`${JSON.stringify(change)}\n`);
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
