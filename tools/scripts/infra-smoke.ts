/**
 * Checks that the local infra stack (pnpm infra:up) matches what the services expect:
 * Postgres extensions + logical replication + powersync publication, Redis, Centrifugo, PowerSync.
 */
import pg from 'pg';
import { createClient } from 'redis';

const config = {
  databaseUrl:
    process.env['DATABASE_URL'] ?? 'postgres://app_owner:app_owner@localhost:54320/critterpass',
  redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:63790',
  centrifugoUrl: process.env['CENTRIFUGO_URL'] ?? 'http://localhost:8000',
  powersyncUrl: process.env['POWERSYNC_URL'] ?? 'http://localhost:8080',
};

type Check = { name: string; run: () => Promise<void> };

async function expectHttpOk(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
}

const checks: Check[] = [
  {
    name: 'postgres: extensions, logical replication, powersync publication',
    run: async () => {
      const client = new pg.Client({
        connectionString: config.databaseUrl,
        connectionTimeoutMillis: 3000,
      });
      await client.connect();
      try {
        const { rows } = await client.query<{ extname: string }>(
          'select extname from pg_extension',
        );
        const installed = new Set(rows.map((row) => row.extname));
        const missing = ['vector', 'pg_trgm', 'unaccent', 'pgcrypto'].filter(
          (ext) => !installed.has(ext),
        );
        if (missing.length > 0) throw new Error(`missing extensions: ${missing.join(', ')}`);

        const wal = await client.query<{ wal_level: string }>('show wal_level');
        if (wal.rows[0]?.wal_level !== 'logical') throw new Error('wal_level is not logical');

        const publication = await client.query(
          "select 1 from pg_publication where pubname = 'powersync'",
        );
        if (publication.rowCount !== 1) throw new Error('publication powersync is missing');
      } finally {
        await client.end();
      }
    },
  },
  {
    name: 'redis: PING',
    run: async () => {
      const client = createClient({ url: config.redisUrl, socket: { connectTimeout: 3000 } });
      client.on('error', () => undefined);
      await client.connect();
      try {
        if ((await client.ping()) !== 'PONG') throw new Error('unexpected PING reply');
      } finally {
        await client.close();
      }
    },
  },
  { name: 'centrifugo: /health', run: () => expectHttpOk(`${config.centrifugoUrl}/health`) },
  {
    name: 'powersync: /probes/liveness',
    run: () => expectHttpOk(`${config.powersyncUrl}/probes/liveness`),
  },
];

let failed = 0;
for (const check of checks) {
  try {
    await check.run();
    console.log(`ok    ${check.name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL  ${check.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
process.exit(failed === 0 ? 0 : 1);
