/**
 * A real Centrifugo for the realtime client suites, running this repo's
 * infra/centrifugo/config.json. Its subscribe and publish proxies point at a local server standing
 * in for the api: every subscription is allowed (channel ACL is proven by the api's own suites) with
 * presence `info`, and a client publication is re-enveloped with the publisher's uid exactly as the
 * api's publish proxy does (services/api/src/realtime/publish-rules.ts).
 */
import { createHmac, randomUUID } from 'node:crypto';
import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

/* eslint-disable lingui/no-unlocalized-strings -- test infrastructure, never rendered copy. */
const API_KEY = 'test-centrifugo-api-key';
const TOKEN_SECRET = 'test-centrifugo-token-secret-0123456789';
const CONFIG = path.resolve(__dirname, '../../../../../../infra/centrifugo/config.json');

export interface CentrifugoHarness {
  readonly wsUrl: string;
  /** An `aud=rt` connection token for `uid`, signed like the api's `/api/auth/token`. */
  token(uid: string): string;
  /** Server-side publish through the HTTP API (what the outbox relay does). */
  publish(channel: string, data: unknown): Promise<void>;
  /** Client publications the proxy accepted, in arrival order. */
  readonly clientPublishes: {
    readonly user: string;
    readonly channel: string;
    readonly type: string;
    readonly data: unknown;
    readonly at: number;
  }[];
  stop(): Promise<void>;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
  });
}

function postJson(url: string, payload: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      url,
      { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': API_KEY } },
      (response) => {
        void readBody(response).then(resolve, reject);
      },
    );
    outgoing.on('error', reject);
    outgoing.end(JSON.stringify(payload));
  });
}

export function envelope(type: string, data: unknown, id: string = randomUUID()) {
  return { v: 1, id, type, at: new Date().toISOString(), data };
}

export async function startCentrifugo(): Promise<CentrifugoHarness> {
  const clientPublishes: CentrifugoHarness['clientPublishes'] = [];
  const proxy: Server = createServer((request, response) => {
    void readBody(request).then((body) => {
      const user = typeof body.user === 'string' ? body.user : '';
      let result: unknown = { info: { name: `name-${user.slice(0, 8)}`, avatar: null } };
      if (request.url === '/publish') {
        const published = (body.data ?? {}) as { type?: unknown; data?: unknown };
        const type = typeof published.type === 'string' ? published.type : 'unknown';
        const extra =
          typeof published.data === 'object' && published.data !== null ? published.data : {};
        clientPublishes.push({
          user,
          channel: String(body.channel),
          type,
          data: published.data,
          at: Date.now(),
        });
        result = { data: envelope(type, { ...extra, uid: user }), skip_history: true };
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ result }));
    });
  });
  await new Promise<void>((resolve) => proxy.listen(0, '0.0.0.0', resolve));
  const proxyPort = (proxy.address() as AddressInfo).port;
  // Docker's host-gateway alias rather than Testcontainers' shared SSH port forwarder: suites in
  // parallel Jest workers would otherwise share one forwarder and reset each other's tunnels.
  const proxyBase = `http://host.docker.internal:${proxyPort}`;

  const container: StartedTestContainer = await new GenericContainer('centrifugo/centrifugo:v6.9.6')
    .withCopyFilesToContainer([{ source: CONFIG, target: '/centrifugo/config.json' }])
    .withCommand(['centrifugo', '--config=/centrifugo/config.json'])
    .withExtraHosts([{ host: 'host.docker.internal', ipAddress: 'host-gateway' }])
    .withEnvironment({
      CENTRIFUGO_ENGINE_TYPE: 'memory',
      CENTRIFUGO_HTTP_API_KEY: API_KEY,
      CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY: TOKEN_SECRET,
      CENTRIFUGO_CLIENT_ALLOWED_ORIGINS: '*',
      CENTRIFUGO_CHANNEL_PROXY_SUBSCRIBE_ENDPOINT: `${proxyBase}/subscribe`,
      CENTRIFUGO_CHANNEL_PROXY_PUBLISH_ENDPOINT: `${proxyBase}/publish`,
    })
    .withExposedPorts(8000, 9000)
    .withWaitStrategy(Wait.forHttp('/health', 9000))
    .start();
  const base = `${container.getHost()}:${container.getMappedPort(8000)}`;
  // The server API and health live on Centrifugo's internal port (infra/centrifugo/config.json).
  const apiBase = `${container.getHost()}:${container.getMappedPort(9000)}`;

  return {
    wsUrl: `ws://${base}/connection/websocket`,
    clientPublishes,
    token(uid) {
      const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const claims = base64url(
        JSON.stringify({ sub: uid, aud: 'rt', exp: Math.floor(Date.now() / 1000) + 900 }),
      );
      const signature = createHmac('sha256', TOKEN_SECRET).update(`${header}.${claims}`).digest();
      return `${header}.${claims}.${base64url(signature)}`;
    },
    async publish(channel, data) {
      // node:http rather than fetch: Expo's Jest setup replaces the global fetch with its native one.
      const body = await postJson(`http://${apiBase}/api/publish`, { channel, data });
      if (body.error !== undefined) throw new Error(`publish failed: ${JSON.stringify(body)}`);
    },
    async stop() {
      await new Promise((resolve) => proxy.close(resolve));
      await container.stop();
    },
  };
}
