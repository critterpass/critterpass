import { describe, expect, it } from '@jest/globals';

import { ALEX, DEV, kyotoTrip, MAYA } from '../../scenes/fixtures';
import { buildMustDos, type MustDoRow } from '../model';
import { listWith, listWithout } from '../save';

const trip = kyotoTrip({ me: DEV });

function row(id: string, owner: string, extra: Partial<MustDoRow> = {}): MustDoRow {
  return {
    id,
    owner_id: owner,
    title: `Must-do ${id}`,
    poi_id: null,
    priority: 0,
    co_owner_ids: null,
    fit_status: 'fits',
    fit_note: null,
    target_day: null,
    external_action: 'none',
    external_deadline: null,
    place_address: null,
    ...extra,
  };
}

describe('must-dos model', () => {
  it('shows a queued add as pending until its synced row arrives', () => {
    const queued = [{ id: 'n1', text: 'Ramen crawl', priority: 0 }];
    const before = buildMustDos([], queued, trip.members, DEV, []);
    expect(before.items).toMatchObject([{ id: 'n1', pending: true, primary: true }]);
    const after = buildMustDos(
      [row('n1', DEV, { title: 'Ramen crawl' })],
      queued,
      trip.members,
      DEV,
      [],
    );
    expect(after.items).toMatchObject([{ id: 'n1', pending: false, fit: 'fits' }]);
  });

  it('lists a shared pick under both owners and counts who is still to come', () => {
    const model = buildMustDos(
      [row('a', MAYA, { co_owner_ids: `["${ALEX}"]` })],
      null,
      trip.members,
      DEV,
      [],
    );
    expect(model.items[0]?.owners.map((owner) => owner.uid)).toEqual([MAYA, ALEX]);
    expect(model.waiting).toHaveLength(4);
  });

  it('puts lottery and booking needs ahead of the fit', () => {
    const model = buildMustDos(
      [row('l', MAYA, { external_action: 'lottery', external_deadline: '2027-02-10' })],
      null,
      trip.members,
      DEV,
      [],
    );
    expect(model.items[0]?.pill).toEqual({ kind: 'lottery', closes: '2027-02-10' });
  });
});

describe('the list sent with set_must_dos', () => {
  const mine = buildMustDos([row('p', DEV)], null, trip.members, DEV, []).mine;

  it('adds a pick as an extra when there is a primary, with a client id', () => {
    expect(listWith('t', mine, { text: ' Onsen ', poiId: null }, () => 'x')).toEqual({
      trip_id: 't',
      items: [
        { id: 'p', text: 'Must-do p', priority: 0 },
        { id: 'x', text: 'Onsen', priority: 1 },
      ],
    });
  });

  it('promotes the next one when the primary goes', () => {
    const two = buildMustDos(
      [row('p', DEV), row('q', DEV, { priority: 1 })],
      null,
      trip.members,
      DEV,
      [],
    ).mine;
    expect(listWithout('t', two, 'p').items).toEqual([{ id: 'q', text: 'Must-do q', priority: 0 }]);
  });
});
