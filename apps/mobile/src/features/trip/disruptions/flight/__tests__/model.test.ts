import { describe, expect, it } from '@jest/globals';
import type { DisruptionAction } from '@cp/domain';

import { delayParts, flightModel, type DisruptionRowData } from '../model';

const RIN = '0190f0a0-0000-7000-8000-00000000000a';
const MAYA = '0190f0a0-0000-7000-8000-00000000000b';
const DEV = '0190f0a0-0000-7000-8000-00000000000c';
const POLL = {
  id: '0190f0a0-0000-7000-8000-0000000000f1',
  approve_option_id: '0190f0a0-0000-7000-8000-0000000000f2',
  keep_option_id: '0190f0a0-0000-7000-8000-0000000000f3',
};
const PEOPLE = [
  { id: RIN, name: 'Rin' },
  { id: MAYA, name: 'Maya' },
  { id: DEV, name: 'Dev' },
];

function action(
  fields: Partial<DisruptionAction> & Pick<DisruptionAction, 'id' | 'kind' | 'state'>,
): DisruptionAction {
  return {
    class: 'plan',
    autonomous: false,
    reversible: true,
    cost_delta_minor: 0,
    booking_impact: false,
    affected_user_ids: [RIN],
    item_stable_id: null,
    provider_id: null,
    starts_at: null,
    depends_on: null,
    facts: {},
    decider: null,
    poll: null,
    guide_action_id: null,
    vendor_message_id: null,
    decided_by: null,
    label: '',
    ...fields,
  };
}

const dinner = action({
  id: 'retime_item:dinner',
  kind: 'retime_item',
  state: 'needs_yes',
  affected_user_ids: [RIN, MAYA, DEV],
  facts: { title: 'Dinner', from: '19:30', to: '21:00' },
  decider: {
    policy: 'any_affected',
    threshold: 1,
    tie_breaker: null,
    closes_at: '2026-10-12T12:00:00Z',
  },
  poll: POLL,
});

function row(
  actions: DisruptionAction[],
  fields: Partial<DisruptionRowData> = {},
): DisruptionRowData {
  return {
    id: 'sq938-delay',
    trip_id: 'bali-trip',
    kind: 'flight_delay',
    cause: 'delay',
    status: 'open',
    version: 1,
    title: 'SQ938 lands at 13:50',
    summary: 'New arrival 13:50.',
    affected: JSON.stringify({
      traveller_ids: [RIN],
      item_stable_ids: [],
      unaffected_ids: [MAYA, DEV],
    }),
    facts: JSON.stringify({ flight: 'SQ938', delay_min: 130, new_arrival: '13:50' }),
    actions: JSON.stringify(actions),
    i18n: null,
    ref_id: null,
    ...fields,
  };
}

describe('flightModel', () => {
  const rows = [
    action({ id: 'retime_item:surf', kind: 'retime_item', state: 'done', autonomous: true }),
    action({
      id: 'recompute_leave_by:trip',
      kind: 'recompute_leave_by',
      class: 'system',
      state: 'done',
    }),
    action({ id: 'reschedule_pickup:made', kind: 'reschedule_pickup', state: 'waiting_vendor' }),
    dinner,
    action({
      id: 'contact_vendor:villa',
      kind: 'contact_vendor',
      class: 'vendor',
      state: 'no_answer',
    }),
  ];

  it('splits the rows into done, on its way, questions and problems', () => {
    const model = flightModel(row(rows), RIN, PEOPLE, false);
    expect(model.delayMin).toBe(130);
    expect(model.done.map((r) => r.id)).toEqual(['retime_item:surf', 'recompute_leave_by:trip']);
    expect(model.working.map((r) => r.id)).toEqual(['reschedule_pickup:made']);
    expect(model.questions.map((q) => q.action.id)).toEqual(['retime_item:dinner']);
    expect(model.problems.map((r) => r.id)).toEqual(['contact_vendor:villa']);
    expect(delayParts(model.delayMin)).toEqual({ hours: 2, minutes: 10 });
  });

  it('lets only an affected member answer, and shows who answered', () => {
    expect(flightModel(row(rows), DEV, PEOPLE, false).questions[0]?.canAnswer).toBe(true);
    const others = [{ ...dinner, affected_user_ids: [RIN] }];
    expect(flightModel(row(others), DEV, PEOPLE, false).questions[0]?.canAnswer).toBe(false);
    const decided = [{ ...dinner, state: 'approved' as const, decided_by: MAYA }];
    const model = flightModel(row(decided), RIN, PEOPLE, false);
    // An answered question stays a card that says who decided; it is not listed again below.
    expect(model.questions[0]).toMatchObject({ canAnswer: false, decidedBy: { name: 'Maya' } });
    expect(model.working).toEqual([]);
  });

  it('lets the travellers and organisers tell the crew, and only while it is open', () => {
    expect(flightModel(row(rows), RIN, PEOPLE, false).canAnnounce).toBe(true);
    expect(flightModel(row(rows), DEV, PEOPLE, false).canAnnounce).toBe(false);
    expect(flightModel(row(rows), DEV, PEOPLE, true).canAnnounce).toBe(true);
    expect(flightModel(row(rows, { status: 'resolved' }), RIN, PEOPLE, false).canAnnounce).toBe(
      false,
    );
  });

  it('offers undo to the travellers and organisers while anything can still be taken back', () => {
    expect(flightModel(row(rows), RIN, PEOPLE, false).canUndo).toBe(true);
    // Dev is not on the flight, even though the dinner question touches him.
    expect(flightModel(row(rows), DEV, PEOPLE, false).canUndo).toBe(false);
    expect(flightModel(row(rows), DEV, PEOPLE, true).canUndo).toBe(true);
    const nothingLeft = [action({ id: 'retime_item:surf', kind: 'retime_item', state: 'undone' })];
    expect(flightModel(row(nothingLeft), RIN, PEOPLE, false).canUndo).toBe(false);
  });

  it('reads a cancelled flight and survives rows it cannot parse', () => {
    const model = flightModel(
      row([], { cause: 'cancelled', actions: '{not json' }),
      RIN,
      PEOPLE,
      false,
    );
    expect(model.cause).toBe('cancelled');
    expect(model.done).toEqual([]);
    expect(delayParts(null)).toBeNull();
  });
});
