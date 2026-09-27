import { Centrifuge } from 'centrifuge';

import { summarize, timeSequential } from '../s-db/stats';

import { CENTRIFUGO_NODE_A_URL, CENTRIFUGO_NODE_B_URL } from './docker';
import { createRtHarness } from './harness';

function parseSocketsArg(argv: readonly string[]): number {
  const index = argv.indexOf('--sockets');
  if (index === -1) return 5000;
  const value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value <= 0)
    throw new Error('--sockets must be a positive integer');
  return value;
}

async function mintTokensInBatches(
  mintToken: (userId: string) => Promise<string>,
  count: number,
  batchSize: number,
): Promise<string[]> {
  const tokens: string[] = [];
  for (let start = 0; start < count; start += batchSize) {
    const batch = Array.from({ length: Math.min(batchSize, count - start) }, (_, i) =>
      mintToken(`load-user-${start + i}`),
    );
    tokens.push(...(await Promise.all(batch)));
  }
  return tokens;
}

interface ConnectedClient {
  client: Centrifuge;
}

async function connectOne(url: string, token: string): Promise<ConnectedClient> {
  const client = new Centrifuge(url, { token, websocket: globalThis.WebSocket, timeout: 15_000 });
  // Node's EventEmitter throws on an unhandled 'error' event; a connection failure under
  // load legitimately emits one here on top of rejecting ready(), and the caller below
  // already turns that rejection into a counted failure.
  client.on('error', () => undefined);
  client.connect();
  await client.ready(15_000);
  return { client };
}

async function rampConnections(
  tokens: readonly string[],
  batchSize: number,
): Promise<{ connected: ConnectedClient[]; failures: number; connectMs: number[] }> {
  const connected: ConnectedClient[] = [];
  const connectMs: number[] = [];
  let failures = 0;
  for (let start = 0; start < tokens.length; start += batchSize) {
    const batchTokens = tokens.slice(start, start + batchSize);
    const results = await Promise.all(
      batchTokens.map(async (token, i) => {
        const url = (start + i) % 2 === 0 ? CENTRIFUGO_NODE_A_URL : CENTRIFUGO_NODE_B_URL;
        const startedAt = performance.now();
        try {
          const connectedClient = await connectOne(url, token);
          return { ok: true as const, connectedClient, ms: performance.now() - startedAt };
        } catch (error) {
          return { ok: false as const, error };
        }
      }),
    );
    for (const result of results) {
      if (result.ok) {
        connected.push(result.connectedClient);
        connectMs.push(result.ms);
      } else {
        failures += 1;
      }
    }
    console.error(
      JSON.stringify({
        msg: 's-rt load progress',
        connected: connected.length,
        failures,
        target: tokens.length,
      }),
    );
  }
  return { connected, failures, connectMs };
}

async function main(): Promise<void> {
  const targetSockets = parseSocketsArg(process.argv.slice(2));
  const batchSize = Number(process.env['S_RT_LOAD_BATCH_SIZE'] ?? '250');

  const harness = await createRtHarness();
  try {
    const tokens = await mintTokensInBatches(
      (userId) => harness.mintToken(userId),
      targetSockets,
      batchSize,
    );
    const { connected, failures, connectMs } = await rampConnections(tokens, batchSize);

    const pingSamples = await timeSequential(Math.min(50, connected.length), async () => {
      const target = connected[Math.floor(Math.random() * connected.length)];
      await target?.client.rpc('ping', {}).catch(() => undefined);
    });

    const report = {
      targetSockets,
      connected: connected.length,
      failures,
      connect: summarize(connectMs),
      // rpc has no server-side handler in this harness; this only proves connections stay
      // responsive under load (no timeout), not a real round-trip contract.
      heldOpenRoundTrip: summarize(pingSamples),
      memory: process.memoryUsage(),
    };
    console.log(JSON.stringify({ msg: 's-rt load report', report }));

    for (const { client } of connected) client.disconnect();
  } finally {
    await harness.close();
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ msg: 's-rt load failed', error: String(error) }));
  process.exitCode = 1;
});
