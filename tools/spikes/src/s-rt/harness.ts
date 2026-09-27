import { serve, type ServerType } from '@hono/node-server';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import { Centrifuge } from 'centrifuge';
import { Hono } from 'hono';
import pg from 'pg';

import { createAuthHarness, type SpikeAuthHarness } from '../s-auth/harness';
import { startMockIdp, type MockIdp } from '../s-auth/mock-idp';
import { serveAuthHarness, type RunningHarness } from '../s-auth/serve';

import {
  CENTRIFUGO_NODE_A_URL,
  restartCentrifugo,
  startCentrifugo,
  stopCentrifugo,
  type CentrifugoEndpoints,
} from './docker';
import { createJwksRewriteApp } from './jwks-rewrite';
import { MembershipStore } from './membership';
import { createSubscribeProxyApp } from './proxy';

export interface RtHarness {
  membership: MembershipStore;
  jwksUrl: string;
  /** Mints a connection JWT (aud: rt) for a synthetic user id — no real session needed. */
  mintToken(userId: string): Promise<string>;
  close(): Promise<void>;
}

interface SignJwtResult {
  token: string;
}

/**
 * `signJWT` is a real `better-auth/plugins` jwt-plugin endpoint (server-only: it mints a
 * token for an arbitrary payload without a session, exactly what minting one JWT per
 * synthetic load-test user needs). `SpikeAuthHarness.auth`'s `api` type only reflects
 * whatever `betterAuth()` infers from `buildAuthOptions`'s return type, which is widened to
 * the general `BetterAuthOptions` (needed so `computeSpikeAuthTables` can also accept it) —
 * that widening is exactly what erases plugin-specific endpoints from the inferred `api`
 * surface, so this narrow, source-verified cast stands in for the lost inference.
 */
interface SignJwtApi {
  signJWT(args: { body: { payload: Record<string, unknown> } }): Promise<SignJwtResult>;
}

/** Serves the subscribe proxy and the JWKS `use: "sig"` rewrite (jwks-rewrite.ts) on one port. */
async function startProxyServer(
  membership: MembershipStore,
  sourceJwksUrl: string,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const app = new Hono();
  app.route('/', createSubscribeProxyApp(membership));
  app.route('/', createJwksRewriteApp(sourceJwksUrl));
  const server: ServerType = await new Promise((resolve) => {
    const started = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () =>
      resolve(started),
    );
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('s-rt harness: expected a network address for the subscribe proxy');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

/**
 * Proves Centrifugo can actually verify a token signed with the harness's current key, and
 * recovers if its one-hour JWKS cache (centrifugal.dev/docs/server/authentication) latched
 * onto an empty result from a fetch that raced the signing key's own creation.
 */
async function waitForWorkingJwks(
  canaryToken: string,
  endpoints: CentrifugoEndpoints,
  attempts = 5,
): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const client = new Centrifuge(CENTRIFUGO_NODE_A_URL, {
      token: canaryToken,
      websocket: globalThis.WebSocket,
    });
    client.connect();
    try {
      await client.ready(8000);
      client.disconnect();
      return;
    } catch (error) {
      client.disconnect();
      if (attempt === attempts) {
        throw new Error('s-rt harness: Centrifugo never accepted a valid token', { cause: error });
      }
      await restartCentrifugo(endpoints);
      // The healthcheck (a plain HTTP 200 from /health) can pass slightly before the JWKS
      // manager's own fetch inside the same process completes; give it a moment.
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

/**
 * Brings up the JWT/JWKS source (the S-AUTH harness), the subscribe proxy, and S-RT's own
 * 2-node Centrifugo + Redis (tools/spikes/src/s-rt/docker-compose.yml). Everything but
 * Centrifugo itself runs in this process; Centrifugo reaches back into this process via
 * `host.docker.internal` for JWKS and subscribe decisions (docs/api-contracts-async.md §1.1).
 */
export async function createRtHarness(): Promise<RtHarness> {
  let postgres: StartedPostgreSqlContainer | undefined;
  let mockIdp: MockIdp | undefined;
  let pool: pg.Pool | undefined;
  let authServer: RunningHarness | undefined;
  let proxy: { baseUrl: string; close: () => Promise<void> } | undefined;
  let authHarness: SpikeAuthHarness | undefined;
  let centrifugoStarted = false;

  try {
    [postgres, mockIdp] = await Promise.all([startPostgres(), startMockIdp()]);
    pool = new pg.Pool({
      connectionString: postgres.getConnectionUri(),
      connectionTimeoutMillis: 5000,
    });
    authHarness = await createAuthHarness(pool, mockIdp);
    authServer = await serveAuthHarness(authHarness.auth);
    const membership = new MembershipStore();
    proxy = await startProxyServer(membership, `${authServer.baseUrl}/jwks`);

    // The JWKS signing key is lazily created on the first signed token. Mint one now, before
    // Centrifugo's own JWKS manager starts, so its very first fetch already sees a real key
    // instead of an empty set it might not retry for a while.
    const signJwtApi = authHarness.auth.api as unknown as SignJwtApi;
    await signJwtApi.signJWT({ body: { payload: { sub: '__jwks_warmup__' } } });

    const endpoints: CentrifugoEndpoints = {
      // Not authServer's /jwks directly: Better Auth never sets a JWK "use" field, which
      // Centrifugo v6.9.6 requires to accept a key (see jwks-rewrite.ts).
      jwksUrl: `${proxy.baseUrl.replace('127.0.0.1', 'host.docker.internal')}/jwks`,
      subscribeUrl: `${proxy.baseUrl.replace('127.0.0.1', 'host.docker.internal')}/internal/rt/subscribe`,
    };
    await startCentrifugo(endpoints);
    centrifugoStarted = true;
    const canaryToken = (
      await signJwtApi.signJWT({ body: { payload: { sub: '__jwks_canary__' } } })
    ).token;
    await waitForWorkingJwks(canaryToken, endpoints);

    return {
      membership,
      jwksUrl: `${proxy.baseUrl}/jwks`,
      async mintToken(userId: string) {
        const result = await signJwtApi.signJWT({ body: { payload: { sub: userId } } });
        return result.token;
      },
      async close() {
        if (centrifugoStarted) await stopCentrifugo();
        await proxy?.close();
        await authServer?.close();
        await mockIdp?.close();
        await pool?.end();
        await postgres?.stop();
      },
    };
  } catch (error) {
    if (centrifugoStarted) await stopCentrifugo().catch(() => undefined);
    await proxy?.close().catch(() => undefined);
    await authServer?.close().catch(() => undefined);
    await mockIdp?.close().catch(() => undefined);
    await pool?.end().catch(() => undefined);
    await postgres?.stop().catch(() => undefined);
    throw error;
  }
}
