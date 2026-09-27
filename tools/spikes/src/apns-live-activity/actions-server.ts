import { Hono } from 'hono';
import { z } from 'zod';

import type { DeviceActionKey } from './hmac';
import { verify } from './hmac';

const actionEnvelopeSchema = z.object({
  op_id: z.string(),
  command: z.string(),
  scope: z.string(),
  payload: z.record(z.string(), z.string()),
});

export interface LoggedAction {
  command: string;
  scope: string;
  payload: Record<string, string>;
}

/**
 * Stands in for the real api's `POST /v1/actions` (api-contracts-async.md §4–§5): verifies the
 * HMAC device-action-key signature, validates the command envelope, and records what reached it.
 * Extension code (`ImUpIntent`, the NCE vote handler) calls this over HTTP exactly as it would
 * call the real endpoint — the only test double here is *this server standing in for the api
 * service*, the network boundary code-standards.md §17 permits a double at.
 */
export function createActionsServer(
  key: DeviceActionKey,
  onAction: (action: LoggedAction) => void,
) {
  const app = new Hono();

  app.post('/v1/actions', async (c) => {
    const rawBody = Buffer.from(await c.req.arrayBuffer());
    const keyId = c.req.header('X-CP-Key-Id');
    const timestamp = c.req.header('X-CP-Ts');
    const signature = c.req.header('X-CP-Sig');
    if (!keyId || !timestamp || !signature) {
      return c.json(
        {
          error: {
            code: 'ACTION_KEY_MISSING_HEADERS',
            message: 'missing signing headers',
            retryable: false,
          },
        },
        401,
      );
    }
    if (keyId !== key.keyId) {
      return c.json(
        { error: { code: 'ACTION_KEY_UNKNOWN', message: 'unknown key id', retryable: false } },
        401,
      );
    }

    const verdict = verify('POST', '/v1/actions', rawBody, { keyId, timestamp, signature }, key);
    if (!verdict.valid) {
      return c.json(
        {
          error: {
            code: 'ACTION_KEY_INVALID_SIGNATURE',
            message: verdict.reason,
            retryable: false,
          },
        },
        401,
      );
    }

    const parsed = actionEnvelopeSchema.safeParse(JSON.parse(rawBody.toString('utf8')));
    if (!parsed.success) {
      return c.json(
        { error: { code: 'VALIDATION_FAILED', message: parsed.error.message, retryable: false } },
        422,
      );
    }

    onAction({
      command: parsed.data.command,
      scope: parsed.data.scope,
      payload: parsed.data.payload,
    });
    return c.json({ result: { op_id: parsed.data.op_id } });
  });

  return app;
}
