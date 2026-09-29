/**
 * The Developer tools "Seed demo data" action: asks the api for the caller's demo world
 * (`POST /v1/dev/seed-demo`, staging only) and waits until sync has delivered it, so the screen a
 * tester opens next already shows the crew, trip and inbox. Only the (dev) route imports this, so
 * production bundles never contain it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: a route path, SQL and
   developer-facing errors, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

export type DemoScenario = 'everyday' | 'inbox' | 'caught_up';

export interface SeedDemoDeps {
  readonly baseUrl: string;
  readonly sessionHeaders: () => Promise<Record<string, string>>;
  readonly db: Pick<AbstractPowerSyncDatabase, 'getAll'>;
  readonly fetch?: typeof fetch;
  /** How long to wait for sync to deliver the seeded rows. */
  readonly syncTimeoutMs?: number;
  readonly pollMs?: number;
}

export interface SeedDemoOutcome {
  readonly crewId: string;
  readonly created: boolean;
  /** False when the rows had not all arrived within the timeout. */
  readonly synced: boolean;
}

interface SeedDemoResponse {
  readonly crew_id: string;
  readonly trip_id: string;
  readonly created: boolean;
  readonly inbox_item_ids: readonly string[];
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function arrived(db: SeedDemoDeps['db'], seeded: SeedDemoResponse): Promise<boolean> {
  const ids = [seeded.crew_id, seeded.trip_id, ...seeded.inbox_item_ids];
  const marks = ids.map(() => '?').join(', ');
  const rows = await db.getAll<{ id: string }>(
    `SELECT id FROM crews WHERE id IN (${marks})
     UNION ALL SELECT id FROM trips WHERE id IN (${marks})
     UNION ALL SELECT id FROM inbox_items WHERE id IN (${marks})`,
    [...ids, ...ids, ...ids],
  );
  return rows.length === ids.length;
}

export async function seedDemoData(
  deps: SeedDemoDeps,
  scenario: DemoScenario = 'everyday',
): Promise<SeedDemoOutcome> {
  const request = deps.fetch ?? fetch;
  const response = await request(new URL('/v1/dev/seed-demo', deps.baseUrl).href, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await deps.sessionHeaders()) },
    body: JSON.stringify({ scenario }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string };
    } | null;
    throw new Error(`seed-demo failed: HTTP ${response.status} ${body?.error?.code ?? ''}`.trim());
  }
  const seeded = (await response.json()) as SeedDemoResponse;
  const deadline = Date.now() + (deps.syncTimeoutMs ?? 30_000);
  let synced = await arrived(deps.db, seeded);
  while (!synced && Date.now() < deadline) {
    await wait(deps.pollMs ?? 500);
    synced = await arrived(deps.db, seeded);
  }
  return { crewId: seeded.crew_id, created: seeded.created, synced };
}
