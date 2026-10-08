/**
 * The envelope the app actually builds, fed through the validators the api runs on it
 * (`commandEnvelopeSchema` plus the command's payload schema), so the two cannot drift apart; and
 * how the online path maps an error envelope's `retryable` flag onto `rejected` / `unavailable`.
 * The transport is the only double: it records the body and answers like the api would.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import { commandEnvelopeSchema, generateUuidV7, startPassPayloadSchema } from '@cp/domain';

import { buildRegisterDeviceEnvelope } from '../../push/register';
import { removeDir } from '../../powersync/test-support/open-node-database';
import {
  openTestLocalFirst,
  TEST_DEVICE,
  type TestLocalFirst,
} from '../../powersync/test-support/local-first-fixture';
import type { SyncTransport, TransportResponse } from '../../powersync/transport';
import { createCommandClient } from '../client';
import { deviceTimeZone } from '../device';
import { defineClientCommand } from '../summaries';

const START_PASS = defineClientCommand<{ pass_id: string }>({ name: 'start_pass', offline: false });

let stack: TestLocalFirst;

// One database for the file: the online path never writes to it.
beforeAll(async () => {
  stack = await openTestLocalFirst({ holdUploads: true });
});

afterAll(async () => {
  await stack.close();
  removeDir(stack.dir);
});

function recordingTransport(answer: TransportResponse) {
  const bodies: unknown[] = [];
  const transport: SyncTransport = {
    postJson: (_path, body) => {
      bodies.push(body);
      return Promise.resolve(answer);
    },
  };
  return { transport, bodies };
}

function clientReporting(tz: string, answer: TransportResponse) {
  const { transport, bodies } = recordingTransport(answer);
  const client = createCommandClient({
    db: stack.db,
    queue: { schedule: () => undefined },
    transport,
    uid: () => stack.uid,
    device: () => Promise.resolve({ ...TEST_DEVICE, tz: deviceTimeZone(tz) }),
  });
  return { client, bodies };
}

const APPLIED = { status: 200, body: { status: 'applied', result: { number: '000001' } } };

describe('command envelope contract with the api', () => {
  it.each(['GMT', 'UTC', 'Etc/UTC', 'Asia/Saigon', 'Europe/London', 'GMT+0700', ''])(
    'start_pass from a device reporting %j passes the server envelope and payload schemas',
    async (tz) => {
      const { client, bodies } = clientReporting(tz, APPLIED);

      await client.send(START_PASS, { pass_id: generateUuidV7() });

      const parsed = commandEnvelopeSchema(startPassPayloadSchema).safeParse(bodies[0]);
      expect(parsed.error?.issues).toBeUndefined();
    },
  );

  it('register_device from a simulator reporting GMT passes the server envelope schema', () => {
    const envelope = buildRegisterDeviceEnvelope(
      {
        uid: stack.uid,
        installId: generateUuidV7(),
        platform: 'ios',
        appVersion: '1.0.0',
        tz: 'GMT',
        locale: 'en',
        foreground: true,
      },
      new Date(),
    );

    // Its payload schema lives in the api; the envelope is what the device block can break.
    const parsed = commandEnvelopeSchema(startPassPayloadSchema)
      .omit({ payload: true })
      .safeParse(envelope);
    expect(parsed.error?.issues).toBeUndefined();
  });
});

describe('online command outcomes', () => {
  const errorBody = (code: string, retryable: boolean) => ({
    error: { code, message: code, retryable, detail: { reason: 'x' } },
  });

  it.each<[number, string, boolean, 'rejected' | 'unavailable']>([
    [422, 'VALIDATION', false, 'rejected'],
    [429, 'NUDGE_TOO_SOON', false, 'rejected'],
    [429, 'RATE_LIMITED', true, 'unavailable'],
    [500, 'INTERNAL', true, 'unavailable'],
    [503, 'SUPPLIER_UNAVAILABLE', true, 'unavailable'],
  ])('%i %s (retryable %s) is %s', async (status, code, retryable, kind) => {
    const { client } = clientReporting('Asia/Ho_Chi_Minh', {
      status,
      body: errorBody(code, retryable),
    });

    const result = await client.send(START_PASS, { pass_id: generateUuidV7() });

    expect(result).toMatchObject({ kind, code });
  });

  it('treats a non-envelope error body as unavailable', async () => {
    const { client } = clientReporting('UTC', { status: 502, body: 'Bad Gateway' });

    const result = await client.send(START_PASS, { pass_id: generateUuidV7() });

    expect(result).toMatchObject({ kind: 'unavailable', code: 'HTTP_502' });
  });
});
