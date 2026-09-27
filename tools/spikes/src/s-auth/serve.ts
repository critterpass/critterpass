import { serve, type ServerType } from '@hono/node-server';
import { Hono } from 'hono';

import type { BetterAuthInstance } from './harness';

export interface RunningHarness {
  /** Base URL for this harness's Better Auth mount, e.g. `http://127.0.0.1:51234/api/auth`. */
  baseUrl: string;
  close(): Promise<void>;
}

/**
 * Serves a Better Auth instance over a real socket. JWKS verification ("what
 * PowerSync/Centrifugo do") fetches over the network by design, and S-RT reuses this to give
 * a local Centrifugo container a real JWKS URL, so this harness is never driven purely
 * in-process.
 */
export async function serveAuthHarness(auth: BetterAuthInstance): Promise<RunningHarness> {
  const app = new Hono();
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

  const server: ServerType = await new Promise((resolve) => {
    const started = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () =>
      resolve(started),
    );
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('s-auth serve: expected a network address, got a pipe/unix socket');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/api/auth`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
