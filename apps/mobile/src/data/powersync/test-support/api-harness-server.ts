/**
 * Serves the api's own command-door test harness (services/api/test/routes/command-doors-harness.ts:
 * Testcontainers Postgres + Redis, Better Auth, the real `/sync/upload`, `/v1/cmd`,
 * `/v1/cmd-results` routes and the suite's test commands) over loopback HTTP, so the mobile sync
 * client talks to the real Hono app through a real network stack. Runs as its own Node process
 * under `tsx` (start-api-harness.ts spawns it): the server code is loaded by file path at run time
 * and never becomes part of the app's module graph.
 *
 * Prints `{"port": n}` on stdout once listening. `GET /__harness/crews/:id` reports how many rows
 * a crew id has, for exactly-once assertions.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, a route path, a wire code or a developer-facing error, never copy. */
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

interface DoorsHarness {
  readonly pool: {
    query(sql: string, params: unknown[]): Promise<{ rows: { count: string }[] }>;
  };
  request(path: string, init?: RequestInit): Promise<Response>;
  stop(): Promise<void>;
}

interface HarnessModule {
  readonly startCommandDoors: (register: (registry: unknown) => void) => Promise<DoorsHarness>;
}

interface TestCommandsModule {
  readonly registerTestCommands: (registry: unknown) => void;
}

const ROUTES_DIR = path.resolve(__dirname, '../../../../../../services/api/test/routes');

async function load<T>(file: string): Promise<T> {
  return (await import(pathToFileURL(path.join(ROUTES_DIR, file)).href)) as T;
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function crewCount(harness: DoorsHarness, id: string): Promise<Response> {
  const { rows } = await harness.pool.query('SELECT count(*) FROM crews WHERE id = $1', [id]);
  return Response.json({ count: Number(rows[0]?.count ?? 0) });
}

async function main(): Promise<void> {
  const { startCommandDoors } = await load<HarnessModule>('command-doors-harness.ts');
  const { registerTestCommands } = await load<TestCommandsModule>('test-commands.ts');
  const harness = await startCommandDoors(registerTestCommands);

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = req.url ?? '/';
      const crewMatch = /^\/__harness\/crews\/([0-9a-f-]+)$/.exec(url);
      let response: Response;
      if (crewMatch?.[1] !== undefined) {
        response = await crewCount(harness, crewMatch[1]);
      } else {
        const body = await readBody(req);
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') headers.set(name, value);
        }
        response = await harness.request(url, {
          method: req.method ?? 'GET',
          headers,
          ...(body.length > 0 ? { body: body.toString('utf8') } : {}),
        });
      }
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.end(Buffer.from(await response.arrayBuffer()));
    })().catch((error: unknown) => {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(String(error));
    });
  });

  const shutdown = () => {
    server.close();
    void harness.stop().finally(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    process.stdout.write(`${JSON.stringify({ port })}\n`);
  });
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error instanceof Error ? error.stack : error)}\n`);
  process.exit(1);
});
