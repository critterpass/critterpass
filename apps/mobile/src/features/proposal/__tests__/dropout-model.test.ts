/**
 * The dropout's change list shows each op the worker stored with its old value struck, names
 * members and cost lines from the trip, skips ops it can't word, and reads the viewer's own share
 * before and after from the stored re-split (never recomputed on the phone).
 */
import { beforeAll, describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { changeRows, shareChange } from '../dropout/model';

const names = (uid: string) => ({ u1: 'Linh', u2: 'Dev' })[uid] ?? '';
const label = (id: string) => ({ stay: 'Hội An homestay' })[id] ?? id;

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('dropout model', () => {
  it('words each op with the old value struck', () => {
    const rows = changeRows(
      [
        { op: 'resplit_component', component_id: 'stay', ways_before: 4, ways_after: 3 },
        { op: 'release_room_bed', stay_id: 's', room_key: '3', occupants_before: ['u1', 'u2'] },
        { op: 'withdraw_reminder_entry', component_id: 'lottery', uid: 'u2' },
        { op: 'something_new' },
      ],
      names,
      label,
    );
    expect(rows.map((r) => [r.title, r.before, r.after])).toEqual([
      ['Hội An homestay', 'split 4 ways', 'split 3'],
      ['Room 3', 'Linh, Dev', 'released'],
      ['lottery', null, 'Dev’s entry is withdrawn'],
    ]);
  });

  it('reads the viewer’s share from the stored re-split', () => {
    const members = [
      {
        uid: 'u1',
        before_minor: '131000',
        after_minor: '133400',
        delta_minor: '2400',
        display_delta_minor: '2400',
      },
    ];
    expect(shareChange(members, 'u1')).toEqual({ before: 131000, after: 133400, delta: 2400 });
    expect(shareChange(members, 'u9')).toBeNull();
  });
});
