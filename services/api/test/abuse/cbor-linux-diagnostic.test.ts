import * as cbor from 'cbor';
import { it } from 'vitest';

import {
  buildAppAttestFixture,
  generateTestRoot,
} from '../fixtures/attestation/app-attest-fixture';

it('prints why the attestation fixture does not decode on this platform', async () => {
  const root = await generateTestRoot();
  const fixture = await buildAppAttestFixture({
    root,
    teamId: 'YFND2EEW8S',
    bundleId: 'app.critterpass',
    challenge: Buffer.from('diagnostic-challenge'),
  });
  const bytes = fixture.attestationObject as Buffer;
  console.log('DIAG versions', JSON.stringify(process.versions));
  console.log('DIAG type', Object.prototype.toString.call(bytes), 'isBuffer', Buffer.isBuffer(bytes), 'len', bytes.length);
  console.log('DIAG head', Buffer.from(bytes).subarray(0, 48).toString('hex'));
  try {
    const all = cbor.decodeAllSync(bytes);
    console.log('DIAG decoded items', all.length, Object.keys(all[0] as object));
  } catch (error) {
    console.log('DIAG decode error', String(error), (error as Error).stack?.split('\n').slice(0, 6).join(' | '));
  }
});
