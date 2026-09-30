/**
 * The pack chips read my queued adds, ticks and removals on top of the synced rows, so a change
 * shows at once offline.
 */
import { describe, expect, it } from '@jest/globals';

import { buildPackChips, type PackingRow, type PendingPackingOp } from '../packing-model';

const TRIP = '0192f000-0000-7000-8000-00000000b411';
const DAY = '2026-10-15';

const ROWS: PackingRow[] = [
  {
    id: 'lamp',
    day: DAY,
    owner_id: null,
    label: 'Headlamp',
    checked: 1,
    suggested_by: 'guide',
    deleted_at: null,
  },
  {
    id: 'layer',
    day: null,
    owner_id: null,
    label: 'Warm layer',
    checked: 0,
    suggested_by: null,
    deleted_at: null,
  },
  {
    id: 'shoes',
    day: DAY,
    owner_id: 'me',
    label: 'Trail shoes',
    checked: 0,
    suggested_by: null,
    deleted_at: null,
  },
  {
    id: 'hat',
    day: '2026-10-16',
    owner_id: null,
    label: 'Sun hat',
    checked: 0,
    suggested_by: null,
    deleted_at: null,
  },
  {
    id: 'gone',
    day: DAY,
    owner_id: null,
    label: 'Snorkel',
    checked: 0,
    suggested_by: null,
    deleted_at: '2026-10-14',
  },
];

function op(
  partial: Partial<PendingPackingOp> & { cmd: string; item_id: string },
): PendingPackingOp {
  return { checked: null, label: null, personal: null, day: null, trip_id: null, ...partial };
}

describe('pack chips', () => {
  it("shows the day's rows and undated rows, never deleted or other days' rows", () => {
    expect(buildPackChips(ROWS, [], TRIP, DAY).map((chip) => chip.id)).toEqual([
      'lamp',
      'layer',
      'shoes',
    ]);
  });

  it('applies queued adds, ticks and removals in order', () => {
    const pending = [
      op({
        cmd: 'add_packing_item',
        item_id: 'cash',
        label: 'Rp 50k',
        personal: 1,
        day: DAY,
        trip_id: TRIP,
      }),
      op({ cmd: 'check_packing_item', item_id: 'layer', checked: 1 }),
      op({ cmd: 'check_packing_item', item_id: 'lamp', checked: 0 }),
      op({ cmd: 'remove_packing_item', item_id: 'shoes' }),
    ];
    const chips = buildPackChips(ROWS, pending, TRIP, DAY);
    expect(chips.map((chip) => [chip.id, chip.packed, chip.pending])).toEqual([
      ['lamp', false, false],
      ['layer', true, false],
      ['cash', false, true],
    ]);
  });
});
