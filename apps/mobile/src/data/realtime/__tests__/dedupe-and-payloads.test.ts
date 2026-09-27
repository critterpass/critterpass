import { describe, expect, it } from '@jest/globals';

import { DEDUPE_WINDOW, parsePublication, RecentIds } from '../subscriptions';

const ID = '0199a3a4-0000-7000-8000-000000000001';
const UID = '0199a3a4-0000-7000-8000-0000000000aa';

function envelope(type: string, data: unknown, id = ID) {
  return { v: 1, id, type, at: '2026-09-27T10:00:00.000Z', data };
}

describe('RecentIds', () => {
  it('reports an id as seen only after it was recorded', () => {
    const recent = new RecentIds();
    expect(recent.seen('a')).toBe(false);
    expect(recent.seen('a')).toBe(true);
    expect(recent.seen('b')).toBe(false);
  });

  it('keeps the last 500 ids and forgets the oldest beyond that', () => {
    const recent = new RecentIds();
    for (let index = 0; index < DEDUPE_WINDOW; index += 1) recent.seen(`id-${index}`);
    expect(recent.size).toBe(DEDUPE_WINDOW);
    expect(recent.seen('id-0')).toBe(true);
    // id-0 was just touched, so the next insert evicts id-1 instead.
    expect(recent.seen('new')).toBe(false);
    expect(recent.size).toBe(DEDUPE_WINDOW);
    expect(recent.seen('id-0')).toBe(true);
    expect(recent.seen('id-1')).toBe(false);
  });
});

describe('parsePublication', () => {
  it('accepts an owner-channel event whose data matches its type schema', () => {
    const data = { op_id: ID, status: 'applied', code: null, result_ref: null };
    expect(parsePublication('user', envelope('cmd.result', data))).toEqual(
      envelope('cmd.result', data),
    );
  });

  it('rejects an owner-channel event whose data breaks its type schema', () => {
    expect(parsePublication('user', envelope('cmd.result', { op_id: 'nope' }))).toBeNull();
  });

  it('passes through a type with no registered schema', () => {
    const data = { expense_id: ID };
    expect(parsePublication('crew_money', envelope('expense.created', data))?.data).toEqual(data);
  });

  it('checks client event shapes re-enveloped by the publish proxy', () => {
    expect(parsePublication('crew_chat', envelope('typing', { uid: UID }))).not.toBeNull();
    expect(parsePublication('crew_chat', envelope('typing', { uid: UID, x: 1 }))).toBeNull();
    const cursor = { uid: UID, anchor: 'plan_item:abc' };
    expect(parsePublication('trip_presence', envelope('cursor', cursor))).not.toBeNull();
    expect(parsePublication('trip_presence', envelope('cursor', { uid: UID }))).toBeNull();
    const here = { uid: UID, screen: 'plan', day: 2 };
    expect(parsePublication('trip_presence', envelope('here', here))).not.toBeNull();
  });

  it('rejects anything that is not a v1 envelope', () => {
    expect(parsePublication('crew', { type: 'typing' })).toBeNull();
    expect(parsePublication('crew', { ...envelope('crew.updated', {}), v: 2 })).toBeNull();
    expect(parsePublication('crew', 'hello')).toBeNull();
  });
});
