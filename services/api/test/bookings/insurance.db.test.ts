/**
 * The insurance vault on the real stack. A saved policy is stored sealed and read back decrypted by
 * its owner only (the device's offline copy); sharing it with a help session without the consent is
 * `CONSENT_REQUIRED`, with it the approved text is recorded; a deleted policy is gone from the read.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createSaveInsurancePolicyCommand,
  deleteInsurancePolicyCommand,
  shareInsuranceCommand,
} from '../../src/commands/bookings/insurance';
import { registerPrivateInsuranceRoute } from '../../src/bookings/private-insurance';
import type { MoneyCrew, MoneyHarness } from '../money/money-harness';
import { buildMoneyCrew } from '../money/money-harness';
import { errorOf, resultOf, type SignedIn } from '../setup/setup-harness';
import { get, keyring, startBookingsHarness } from './bookings-harness';

let harness: MoneyHarness;
let crew: MoneyCrew;
const policyId = generateUuidV7();

beforeAll(async () => {
  harness = await startBookingsHarness(
    (registry) => {
      registry.register(createSaveInsurancePolicyCommand({ keyring }));
      registry.register(deleteInsurancePolicyCommand);
      registry.register(shareInsuranceCommand);
    },
    (app, deps) =>
      registerPrivateInsuranceRoute(app, { pool: deps.pool, sessions: deps.sessions, keyring }),
  );
  crew = await buildMoneyCrew(harness, 2);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('the insurance vault', () => {
  it('stores the policy sealed and reads it back to its owner only', async () => {
    const [organiser, maya] = crew.members as [SignedIn, SignedIn];
    const saved = await harness.run(maya, 'save_insurance_policy', {
      policy_id: policyId,
      trip_id: crew.tripId,
      provider: 'Chubb Travel',
      policy_no: 'CTP-4471-8821',
      assistance_phone: '+65 6398 8797',
    });
    expect(resultOf(saved)).toEqual({ policy_id: policyId });
    const { rows } = await harness.pool.query<{ policy_no_enc: string }>(
      'SELECT policy_no_enc FROM insurance_policies WHERE id = $1',
      [policyId],
    );
    expect(rows[0]?.policy_no_enc).not.toContain('4471');
    const own = await get(harness, maya, '/v1/me/private/insurance');
    expect(own.body['policies']).toEqual([
      expect.objectContaining({
        policy_id: policyId,
        policy_no: 'CTP-4471-8821',
        assistance_phone: '+65 6398 8797',
      }),
    ]);
    expect((await get(harness, organiser, '/v1/me/private/insurance')).body['policies']).toEqual(
      [],
    );
    const theirs = await harness.run(organiser, 'save_insurance_policy', {
      policy_id: policyId,
      provider: 'Mine now',
      policy_no: 'X',
    });
    expect(errorOf(theirs).code).toBe('NOT_FOUND');
  });

  it('shares only with the consent, recording the approved text', async () => {
    const [, maya] = crew.members as [SignedIn, SignedIn];
    const helpSession = generateUuidV7();
    const text = 'Chubb Travel · policy CTP-4471-8821 · assistance +65 6398 8797';
    const refused = await harness.run(maya, 'share_insurance', {
      help_session_id: helpSession,
      text_shown: text,
    });
    expect(errorOf(refused)).toMatchObject({ code: 'CONSENT_REQUIRED' });
    const shared = await harness.run(maya, 'share_insurance', {
      help_session_id: helpSession,
      text_shown: text,
      grant_consent: true,
    });
    expect(resultOf(shared)).toEqual({ help_session_id: helpSession, policy_id: policyId });
    const approvals = await harness.pool.query(
      "SELECT text_shown FROM ops.approvals WHERE subject_kind = 'insurance_share' AND subject_id = $1",
      [helpSession],
    );
    expect(approvals.rows).toEqual([{ text_shown: text }]);
  });

  it('forgets a deleted policy', async () => {
    const [, maya] = crew.members as [SignedIn, SignedIn];
    expect(
      (await harness.run(maya, 'delete_insurance_policy', { policy_id: policyId })).status,
    ).toBe(200);
    expect((await get(harness, maya, '/v1/me/private/insurance')).body['policies']).toEqual([]);
  });
});
