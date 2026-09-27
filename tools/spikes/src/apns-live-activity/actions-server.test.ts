import { describe, expect, it } from 'vitest';

import { createActionsServer, type LoggedAction } from './actions-server';
import { sign } from './hmac';

const KEY = { keyId: 'spike-key-1', secret: Buffer.from('spike-secret-32-bytes-minimum!!!') };

interface ErrorBody {
  error: { code: string; message: string; retryable: boolean };
}

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as ErrorBody;
  return body.error.code;
}

function post(
  app: ReturnType<typeof createActionsServer>,
  body: Buffer,
  headerOverrides: Record<string, string> = {},
) {
  const headers = sign('POST', '/v1/actions', body, KEY);
  return app.request('/v1/actions', {
    method: 'POST',
    body: new Uint8Array(body),
    headers: {
      'X-CP-Key-Id': headers.keyId,
      'X-CP-Ts': headers.timestamp,
      'X-CP-Sig': headers.signature,
      ...headerOverrides,
    },
  });
}

describe('actions-server', () => {
  it('accepts a validly signed, well-formed envelope and hands it to onAction', async () => {
    const received: LoggedAction[] = [];
    const app = createActionsServer(KEY, (action) => received.push(action));
    const body = Buffer.from(
      JSON.stringify({
        op_id: 'op-1',
        command: 'cast_ballot',
        scope: 'ballot',
        payload: { poll_id: 'p1', option_id: 'o1' },
      }),
    );

    const response = await post(app, body);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: { op_id: 'op-1' } });
    expect(received).toEqual([
      { command: 'cast_ballot', scope: 'ballot', payload: { poll_id: 'p1', option_id: 'o1' } },
    ]);
  });

  it('rejects an unknown key id without touching onAction', async () => {
    const received: LoggedAction[] = [];
    const app = createActionsServer(KEY, (action) => received.push(action));
    const body = Buffer.from(
      JSON.stringify({ op_id: 'op-1', command: 'cast_ballot', scope: 'ballot', payload: {} }),
    );

    const response = await post(app, body, { 'X-CP-Key-Id': 'not-the-real-key' });

    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe('ACTION_KEY_UNKNOWN');
    expect(received).toHaveLength(0);
  });

  it('rejects a request missing signing headers', async () => {
    const app = createActionsServer(KEY, () => {});
    const response = await app.request('/v1/actions', { method: 'POST', body: '{}' });
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe('ACTION_KEY_MISSING_HEADERS');
  });

  it('rejects a well-signed envelope that fails validation', async () => {
    const received: LoggedAction[] = [];
    const app = createActionsServer(KEY, (action) => received.push(action));
    const body = Buffer.from(JSON.stringify({ op_id: 'op-1', command: 'cast_ballot' }));

    const response = await post(app, body);

    expect(response.status).toBe(422);
    expect(await errorCode(response)).toBe('VALIDATION_FAILED');
    expect(received).toHaveLength(0);
  });
});
