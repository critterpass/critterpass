/**
 * Writes the Swift `ActivityAttributes` types from the domain's zod contracts into both places
 * that compile them: this module's pod (the app starts, updates and ends activities) and the
 * widget extension (it renders them). ActivityKit pairs the two by type name, so the copies must
 * be identical; a jest test fails when either drifts from the contracts.
 *
 *   pnpm --filter @cp/mobile exec tsx src/features/trip/live-activities/test-support/activity-attributes.ts
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { ACTIVITY_ATTRIBUTES_FILES, activityAttributesSwift } from './activity-attributes-source';

const root = path.resolve(import.meta.dirname, '../../../../..');
const source = activityAttributesSwift();
for (const file of ACTIVITY_ATTRIBUTES_FILES) writeFileSync(path.join(root, file), source);
