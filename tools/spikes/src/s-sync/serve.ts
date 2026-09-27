import { serve, type ServerType } from '@hono/node-server';
import type { Hono } from 'hono';

export interface RunningApp {
  baseUrl: string;
  close(): Promise<void>;
}

/**
 * Serves the combined S-SYNC app (app.ts) over a real socket. Reused as-is by the local harness
 * (ephemeral port) and by the Railway entrypoint (fixed `PORT`, never closed) — see
 * `tools/spikes/s-sync-app.Dockerfile`.
 */
export async function listen(app: Hono, port = 0): Promise<RunningApp> {
  const server: ServerType = await new Promise((resolve) => {
    const started = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => resolve(started));
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('s-sync serve: expected a network address, got a pipe/unix socket');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
