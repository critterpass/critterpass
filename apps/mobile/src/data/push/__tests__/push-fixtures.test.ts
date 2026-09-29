import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import {
  apnsAlertPayloadSchema,
  fcmNotificationDataSchema,
  jsonBytes,
  MAX_CP_BYTES,
} from '@cp/domain';

const FIXTURES = path.join(__dirname, '../../../../../../e2e/notifications/fixtures');
const CREW = { CREW_ID: '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b02', CREW_NAME: 'Bali crew' };

/** A fixture as the runner delivers it, with its crew placeholders filled in. */
function fixture(name: string): Record<string, unknown> {
  const raw = readFileSync(path.join(FIXTURES, name), 'utf8').replace(
    /\$\{(CREW_ID|CREW_NAME)\}/g,
    (_, key: keyof typeof CREW) => CREW[key],
  );
  return JSON.parse(raw) as Record<string, unknown>;
}

describe('notification e2e fixtures match what the worker sends', () => {
  it.each(['ios-guide-nudge.json', 'ios-crew-chat.json'])('%s is a valid APNs alert', (name) => {
    const payload = apnsAlertPayloadSchema.parse(fixture(name));
    expect(jsonBytes(payload.cp)).toBeLessThanOrEqual(MAX_CP_BYTES);
  });

  it.each(['android-guide-nudge.json', 'android-crew-chat.json'])(
    '%s is a valid FCM data message',
    (name) => {
      const data = fcmNotificationDataSchema.parse(fixture(name));
      expect(jsonBytes(JSON.parse(data.cp))).toBeLessThanOrEqual(MAX_CP_BYTES);
    },
  );

  it('the two platforms carry the same push', () => {
    const ios = fixture('ios-crew-chat.json')['cp'];
    const android = JSON.parse(String(fixture('android-crew-chat.json')['cp'])) as unknown;
    expect(android).toEqual(ios);
  });
});
