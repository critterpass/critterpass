/**
 * The Swift ActivityAttributes the app module and the widget extension compile match the domain
 * contracts the server builds payloads from: a push the server sends always decodes on the phone.
 * Regenerate: `pnpm --filter @cp/mobile exec tsx src/features/trip/live-activities/test-support/activity-attributes.ts`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import {
  ACTIVITY_ATTRIBUTES_FILES,
  activityAttributesSwift,
} from '../test-support/activity-attributes-source';

const MOBILE = path.resolve(__dirname, '../../../../..');

describe('generated ActivityAttributes', () => {
  it.each(ACTIVITY_ATTRIBUTES_FILES)('%s matches the domain contracts', (file) => {
    expect(readFileSync(path.join(MOBILE, file), 'utf8')).toBe(activityAttributesSwift());
  });
});
