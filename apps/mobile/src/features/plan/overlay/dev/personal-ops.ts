/**
 * Winston's "just me" plan over the Bali week: he swapped Wednesday's spa for a surf lesson,
 * skipped the kecak dance, and moved the ridge walk to 16:00, which the crew has since moved too.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the lab and tests. */
import type { ChangeSetOp } from '@cp/domain';

import { BALI_ITEMS, WINSTON } from '../../overview/dev/bali-plan';

export const SURF_LESSON = '0199b000-0000-7000-8000-000000005a01';
export const PERSONAL_OPS_ID = '0199b000-0000-7000-8000-0000000dd001';

const byLabel = (label: string) => BALI_ITEMS.find((item) => item.label === label);

export const PERSONAL_OPS: readonly ChangeSetOp[] = [
  {
    op: 'swap',
    target: byLabel('Spa')?.stableId ?? '',
    before: { poi_id: byLabel('Spa')?.poiId ?? null },
    after: { poi_id: SURF_LESSON, category: 'beach', attendee_ids: [WINSTON] },
    reason: 'Surf instead.',
    affected_user_ids: [WINSTON],
    booking_impact: false,
  },
  {
    op: 'remove',
    target: byLabel('Kecak at sunset')?.stableId ?? '',
    reason: 'Early night.',
    affected_user_ids: [WINSTON],
    booking_impact: false,
  },
  {
    op: 'retime',
    target: byLabel('Ridge walk')?.stableId ?? '',
    // The crew's walk started at 14:00 when Winston moved his; it has moved since.
    before: { starts_at: '2026-11-04T05:30:00.000Z' },
    after: { starts_at: '2026-11-04T08:00:00.000Z' },
    reason: 'Later light.',
    affected_user_ids: [WINSTON],
    booking_impact: false,
  },
];

export const PERSONAL_ROWS = [
  { id: PERSONAL_OPS_ID, ops: JSON.stringify(PERSONAL_OPS), status: 'active' },
];

export const PERSONAL_POI_NAMES: ReadonlyMap<string, string> = new Map([
  [SURF_LESSON, 'Surf lesson'],
]);
