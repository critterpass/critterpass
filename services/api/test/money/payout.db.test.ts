/**
 * Payout methods on the real stack. A payee's PayNow details are stored encrypted (no plaintext in
 * the row, a log line, an event, a hint or a result) and read back only by their owner; the payer
 * of an open payment to them sees them through the audited reveal, and nobody else does: not
 * another crewmate, not the payee themselves, and not the payer once the payment is confirmed. A
 * notification's MARK PAID button runs the same `mark_paid` through `/v1/actions`.
 */
import { randomBytes, randomUUID } from 'node:crypto';

import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDeviceCommands } from '../../src/commands/device';
import { registerMoneyRoutes } from '../../src/money/routes';
import { registerActionKeyRoutes } from '../../src/routes/action-keys';
import { registerActionsRoute } from '../../src/routes/actions';
import { signedHeaders } from '../routes/action-doors-harness';
import { envelope } from '../routes/command-doors-harness';
import { capturedOutputs, errorOf, resultOf, type SignedIn } from '../setup/setup-harness';
import {
  buildMoneyCrew,
  startMoneyHarness,
  type MoneyCrew,
  type MoneyHarness,
} from './money-harness';

// A distinctive number that could not appear anywhere by accident.
const PHONE = '+6591738264';
const keyring = { activeKeyId: 'k1', keys: { k1: randomBytes(32) } };

let harness: MoneyHarness;
let crew: MoneyCrew;
let payee: SignedIn;
let payer: SignedIn;
let bystander: SignedIn;
let paymentId: string;

async function get(session: SignedIn, path: string) {
  const response = await harness.request(path, { headers: { cookie: session.cookie } });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function audits(): Promise<number> {
  const { rows } = await harness.pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM ops.reveal_audit WHERE subject_id = $1',
    [paymentId],
  );
  return rows[0]!.n;
}

beforeAll(async () => {
  harness = await startMoneyHarness(registerDeviceCommands, (app, deps) => {
    const actionDeps = { ...deps, keyring };
    registerActionKeyRoutes(app, actionDeps);
    registerActionsRoute(app, actionDeps);
    registerMoneyRoutes(app, actionDeps);
  });
  crew = await buildMoneyCrew(harness, 3);
  [payee, payer, bystander] = crew.members as [SignedIn, SignedIn, SignedIn];
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('setting a payout method', () => {
  it('stores the details encrypted and shows them to their owner only', async () => {
    const set = await harness.run(payee, 'set_payout_method', {
      kind: 'paynow',
      country: 'SG',
      details: { proxy_type: 'mobile', proxy: PHONE, name: 'Wei Ling' },
    });
    expect(resultOf(set)).toMatchObject({ kind: 'paynow', removed: false });
    const invalid = await harness.run(payee, 'set_payout_method', {
      kind: 'vietqr',
      details: { bank_bin: 'not-a-bin', account_number: PHONE },
    });
    expect(errorOf(invalid)).toMatchObject({
      code: 'VALIDATION',
      detail: { fields: ['bank_bin', 'account_number'] },
    });
    expect(JSON.stringify(invalid.body)).not.toContain('91738264');

    const { rows } = await harness.pool.query<{ details_enc: string; label: string }>(
      'SELECT details_enc, label FROM payout_methods WHERE user_id = $1',
      [payee.uid],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.details_enc).not.toContain('91738264');
    expect(rows[0]!.label).toBe('PayNow ••8264');

    const own = await get(payee, '/v1/me/payout-methods');
    expect(own.body['methods']).toEqual([
      expect.objectContaining({
        kind: 'paynow',
        details: { proxy_type: 'mobile', proxy: PHONE, name: 'Wei Ling' },
      }),
    ]);
    expect((await get(bystander, '/v1/me/payout-methods')).body['methods']).toEqual([]);
  });
});

describe('revealing it to the payer', () => {
  it('shows the payer of an open payment, audited, and nobody else', async () => {
    paymentId = generateUuidV7();
    const requested = await harness.run(payee, 'request_payment', {
      payment_id: paymentId,
      trip_id: crew.tripId,
      from_uid: payer.uid,
      amount_minor: 2_500,
      currency: 'USD',
    });
    expect(requested.status).toBe(200);

    const seen = await get(payer, `/v1/payments/${paymentId}/payout`);
    expect(seen.status).toBe(200);
    const methods = seen.body['methods'] as { kind: string; details: { proxy?: string } }[];
    expect(methods.map((method) => [method.kind, method.details.proxy])).toEqual([
      ['paynow', PHONE],
    ]);
    expect(await audits()).toBe(1);

    for (const other of [bystander, payee]) {
      const refused = await get(other, `/v1/payments/${paymentId}/payout`);
      expect(refused.status).toBe(404);
    }
    expect(await audits()).toBe(1);
  });

  it('marks paid from the notification action, then closes the reveal once confirmed', async () => {
    const deviceId = randomUUID();
    const registered = await harness.request('/v1/cmd/register_device', {
      method: 'POST',
      headers: { cookie: payer.cookie },
      body: JSON.stringify(
        envelope(
          'register_device',
          { platform: 'ios', tz: 'UTC', locale: 'en', app_version: '1.0.0' },
          { device: { id: deviceId, platform: 'ios', app_version: '1.0.0', tz: 'UTC' } },
        ),
      ),
    });
    expect(registered.status).toBe(200);
    const issued = await harness.request(`/v1/devices/${deviceId}/action-keys`, {
      method: 'POST',
      headers: { cookie: payer.cookie },
      body: JSON.stringify({ scopes: ['money_mark'] }),
    });
    expect(issued.status).toBe(201);
    const key = (await issued.json()) as { key_id: string; secret: string };
    const body = JSON.stringify(
      envelope(
        'mark_paid',
        { payment_id: paymentId, method: 'paynow' },
        {
          actor: { uid: payer.uid, via: 'notif_action' },
          device: { id: deviceId, platform: 'ios', app_version: '1.0.0', tz: 'UTC' },
        },
      ),
    );
    const action = await harness.request('/v1/actions', {
      method: 'POST',
      headers: signedHeaders(key, 'POST', '/v1/actions', body),
      body,
    });
    expect(action.status).toBe(200);
    const { rows } = await harness.pool.query('SELECT status, method FROM payments WHERE id = $1', [
      paymentId,
    ]);
    expect(rows).toEqual([{ status: 'marked_paid', method: 'paynow' }]);

    const confirmed = await harness.run(payee, 'confirm_paid', { payment_id: paymentId });
    expect(confirmed.status).toBe(200);
    expect((await get(payer, `/v1/payments/${paymentId}/payout`)).status).toBe(404);
    expect(await audits()).toBe(1);
  });

  it('never lets the details reach a log, event, hint, result or job', async () => {
    expect(harness.logs.join('\n')).not.toContain('91738264');
    expect(await capturedOutputs(harness.pool)).not.toContain('91738264');
  });
});
