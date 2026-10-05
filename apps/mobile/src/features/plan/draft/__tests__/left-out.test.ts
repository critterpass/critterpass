/**
 * The essentials a draft leaves out, read from its coverage: a reason this app does not know keeps
 * its place; a malformed entry is dropped; and what a redraft took out is what its version leaves
 * out that the draft before it did not.
 */
import { i18n } from '@lingui/core';
import { beforeAll, describe, expect, it } from '@jest/globals';

import { ESSENTIAL_GAP_REASONS } from '@cp/domain';

import { leftOutOf, takenOut } from '../data/left-out';
import { leftOutWhy } from '../data/left-out-copy';

const row = (poiId: string, name: string, reason: string) => ({ poi_id: poiId, name, reason });

describe('leftOutOf', () => {
  it('reads each place with its reason, known or not', () => {
    const read = leftOutOf({
      essentials_left_out: [
        row('p1', 'Langbiang', 'held_in_the_way'),
        row('p2', 'Valley of Love', 'a_reason_from_a_newer_server'),
        { poi_id: 'p3', name: '' },
        'nonsense',
      ],
    });
    expect(read).toEqual([
      { poiId: 'p1', name: 'Langbiang', reason: 'held_in_the_way' },
      { poiId: 'p2', name: 'Valley of Love', reason: 'a_reason_from_a_newer_server' },
    ]);
  });

  it('reads nothing from a coverage without the list', () => {
    expect(leftOutOf({ must_dos: {} })).toEqual([]);
    expect(leftOutOf(null)).toEqual([]);
  });
});

describe('takenOut', () => {
  it('is what the redraft leaves out that the draft before it held', () => {
    const before = leftOutOf({ essentials_left_out: [row('p1', 'Langbiang', 'no_room')] });
    const after = leftOutOf({
      essentials_left_out: [
        row('p1', 'Langbiang', 'no_room'),
        row('p2', 'Valley of Love', 'no_room'),
      ],
    });
    expect(takenOut(before, after).map((place) => place.name)).toEqual(['Valley of Love']);
    expect(takenOut(after, before)).toEqual([]);
  });
});

describe('leftOutWhy', () => {
  beforeAll(() => {
    i18n.loadAndActivate({ locale: 'en', messages: {} });
  });

  it('has words for every reason the planner gives', () => {
    for (const reason of ESSENTIAL_GAP_REASONS) expect(leftOutWhy(reason)).not.toBeNull();
    expect(leftOutWhy('a_reason_from_a_newer_server')).toBeNull();
  });
});
