import {
  column,
  PowerSyncDatabase,
  Schema,
  SyncStreamConnectionMethod,
  Table,
  type CommonPowerSyncDatabase,
  type PowerSyncBackendConnector,
  type PowerSyncCredentials,
} from '@powersync/node';

/** Mirrors `spike.messages` (schema.ts); PowerSync's `id` column is implicit on every table. */
const messages = new Table({
  body: column.text,
  created_by: column.text,
  created_at: column.text,
});

export const spikeSyncSchema = new Schema({ messages });

export interface SpikeSyncClientOptions {
  /** Base URL of the S-SYNC app (app.ts): token minting + `/sync/upload`. */
  appUrl: string;
  /** Base URL of the PowerSync service's client sync endpoint. */
  syncEndpoint: string;
  userId: string;
}

/**
 * `PowerSyncBackendConnector` implementation driving the real write path
 * (system-architecture.md §7.c): `fetchCredentials` mints a short-lived `aud: sync` token,
 * `uploadData` drains the local CRUD queue through the harness's `/sync/upload` door. A non-2xx
 * response throws so the SDK retries with backoff — the harness's upload door itself never
 * returns non-2xx for a validation reject (upload-app.ts), only for genuine failures.
 */
export class SpikeSyncConnector implements PowerSyncBackendConnector {
  constructor(private readonly options: SpikeSyncClientOptions) {}

  async fetchCredentials(): Promise<PowerSyncCredentials> {
    const response = await fetch(`${this.options.appUrl}/internal/spike/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: this.options.userId, audience: 'sync' }),
    });
    if (!response.ok) {
      throw new Error(`s-sync client: token fetch failed with HTTP ${response.status}`);
    }
    const { token } = (await response.json()) as { token: string };
    return { endpoint: this.options.syncEndpoint, token };
  }

  async uploadData(database: CommonPowerSyncDatabase): Promise<void> {
    const batch = await database.getCrudBatch();
    if (batch == null) return;
    const ops = batch.crud.map((entry) => ({
      id: entry.id,
      table: entry.table,
      op: entry.op,
      data: entry.opData ?? {},
    }));
    const response = await fetch(`${this.options.appUrl}/sync/upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ops }),
    });
    if (!response.ok) {
      throw new Error(`s-sync client: upload failed with HTTP ${response.status}`);
    }
    await batch.complete();
  }
}

export interface CreateClientOptions {
  dbFilename: string;
  dbLocation: string;
  /** Defaults to 1 (a single worker thread per client) — load.ts's connection ramp needs the smallest per-client footprint that still works. */
  readWorkerCount?: number;
}

export async function createSpikeSyncClient(options: CreateClientOptions): Promise<PowerSyncDatabase> {
  const db = new PowerSyncDatabase({
    schema: spikeSyncSchema,
    database: {
      dbFilename: options.dbFilename,
      dbLocation: options.dbLocation,
      readWorkerCount: options.readWorkerCount ?? 1,
    },
  });
  await db.init();
  return db;
}

export function connectSpikeSyncClient(
  db: PowerSyncDatabase,
  options: SpikeSyncClientOptions,
): Promise<void> {
  return db.connect(new SpikeSyncConnector(options), {
    connectionMethod: SyncStreamConnectionMethod.WEB_SOCKET,
  });
}

/**
 * `db.connect()` resolves once the connector is registered, not once the connection actually
 * succeeds — a permanently rejected connection (e.g. `powersync-api`'s `max_concurrent_connections`
 * cap, PSYNC_S2304) never rejects that promise; the SDK just retries forever in the background,
 * logging on every attempt. A connection-count ramp needs to know which attempts actually
 * succeeded and must stop retrying the ones that will not, so this races a real success signal
 * (`waitForFirstSync`) against `timeoutMs` and disconnects (stopping the retry loop) on failure.
 */
export async function connectAndWaitForSync(
  db: PowerSyncDatabase,
  options: SpikeSyncClientOptions,
  timeoutMs: number,
): Promise<void> {
  await connectSpikeSyncClient(db, options);
  try {
    await Promise.race([
      db.waitForFirstSync(),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error(`s-sync client: waitForFirstSync timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  } catch (error) {
    await db.disconnect().catch(() => undefined);
    throw error;
  }
}
