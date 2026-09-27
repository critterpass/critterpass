import { describe, expect, it } from 'vitest';

import { CHANNEL_NAMESPACES, channelName } from '../src/channel-names';
import {
  checkRtEnvelope,
  parseRtChannel,
  RT_ACL_RULE_SQL,
  RT_CORE_NAMESPACES,
  RT_CREW_SCOPED_NAMESPACES,
  RT_ENVELOPE_MAX_BYTES,
  RT_TRIP_SCOPED_NAMESPACES,
  rtCursorPublishSchema,
  rtHerePublishSchema,
  rtTypingPublishSchema,
  rtUserPayloadSchema,
  toRtEnvelope,
} from '../src/realtime';

const ID = '01928f6e-7c1a-7b3e-8f00-123456789abc';
const AT = '2026-09-27T10:00:00.000Z';

describe('parseRtChannel', () => {
  it('splits a namespaced channel and the user-limited channel', () => {
    expect(parseRtChannel(channelName('crew_chat', ID))).toEqual({
      namespace: 'crew_chat',
      id: ID,
    });
    expect(parseRtChannel(channelName('user', ID))).toEqual({ namespace: 'user', id: ID });
  });

  it('rejects a user channel without the # boundary, a missing namespace and a non-uuid id', () => {
    expect(parseRtChannel(`user:${ID}`)).toBeNull();
    expect(parseRtChannel(`:${ID}`)).toBeNull();
    expect(parseRtChannel(ID)).toBeNull();
    expect(parseRtChannel('crew:not-a-uuid')).toBeNull();
    expect(parseRtChannel(`crew:${ID}:extra`)).toBeNull();
  });
});

describe('core namespace catalogue', () => {
  it('names only known channel namespaces, each once', () => {
    const names = RT_CORE_NAMESPACES.map((spec) => spec.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(CHANNEL_NAMESPACES).toContain(name);
    for (const spec of RT_CORE_NAMESPACES) expect(RT_ACL_RULE_SQL[spec.acl]).toContain('$1');
  });

  it('allows client publish only on crew_chat and trip_presence', () => {
    const publishers = RT_CORE_NAMESPACES.filter((spec) => spec.clientPublish !== undefined);
    expect(publishers.map((spec) => spec.name).sort()).toEqual(['crew_chat', 'trip_presence']);
    const chat = publishers.find((spec) => spec.name === 'crew_chat');
    expect(Object.keys(chat?.clientPublish?.types ?? {})).toEqual(['typing']);
  });

  it('groups crew- and trip-keyed namespaces for revocation fan-out', () => {
    expect(RT_CREW_SCOPED_NAMESPACES).toEqual([
      'crew',
      'crew_chat',
      'crew_money',
      'crew_bookings',
      'crew_collection',
    ]);
    expect(RT_TRIP_SCOPED_NAMESPACES).toContain('trip');
    expect(RT_TRIP_SCOPED_NAMESPACES).toContain('trip_draft');
    expect(RT_TRIP_SCOPED_NAMESPACES).toContain('trip_presence');
    expect(RT_TRIP_SCOPED_NAMESPACES).not.toContain('user');
  });
});

describe('client publish schemas', () => {
  it('accept the exact published shapes', () => {
    expect(rtTypingPublishSchema.safeParse({ type: 'typing' }).success).toBe(true);
    expect(
      rtHerePublishSchema.safeParse({ type: 'here', data: { screen: '3g-2', day: 2 } }).success,
    ).toBe(true);
    expect(
      rtCursorPublishSchema.safeParse({ type: 'cursor', data: { anchor: `plan_item:${ID}` } })
        .success,
    ).toBe(true);
    expect(
      rtCursorPublishSchema.safeParse({ type: 'cursor', data: { anchor: null } }).success,
    ).toBe(true);
  });

  it('reject extra fields and server-only types', () => {
    expect(rtTypingPublishSchema.safeParse({ type: 'typing', uid: ID }).success).toBe(false);
    expect(rtTypingPublishSchema.safeParse({ type: 'message.created' }).success).toBe(false);
    expect(
      rtCursorPublishSchema.safeParse({ type: 'cursor', data: { anchor: 'x'.repeat(200) } })
        .success,
    ).toBe(false);
  });
});

describe('envelopes', () => {
  it('passes a full envelope through unchanged', () => {
    const envelope = { v: 1, id: ID, type: 'member.joined', at: AT, data: { user_id: ID } };
    expect(toRtEnvelope(envelope, { id: 'unused', at: AT })).toEqual({ ok: true, envelope });
  });

  it('wraps the {type, data} and flat {type, ...fields} shorthands with the row defaults', () => {
    expect(
      toRtEnvelope(
        { type: 'otp.channel_failed', data: { verification_id: null } },
        { id: ID, at: AT },
      ),
    ).toEqual({
      ok: true,
      envelope: {
        v: 1,
        id: ID,
        type: 'otp.channel_failed',
        at: AT,
        data: { verification_id: null },
      },
    });
    const flat = toRtEnvelope(
      { type: 'cmd.result', op_id: ID, status: 'applied', code: null, result_ref: null },
      { id: ID, at: AT },
    );
    expect(flat.ok && flat.envelope.data).toEqual({
      op_id: ID,
      status: 'applied',
      code: null,
      result_ref: null,
    });
    expect(
      flat.ok && rtUserPayloadSchema('cmd.result')?.safeParse(flat.envelope.data).success,
    ).toBe(true);
  });

  it('rejects a payload without a type, a non-object and an oversize envelope', () => {
    expect(toRtEnvelope({ data: {} }, { id: ID, at: AT })).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(toRtEnvelope('hello', { id: ID, at: AT })).toEqual({ ok: false, reason: 'invalid' });
    const big = { v: 1, id: ID, type: 'x.y', at: AT, data: 'a'.repeat(RT_ENVELOPE_MAX_BYTES) };
    expect(checkRtEnvelope(big)).toEqual({ ok: false, reason: 'too_large' });
  });

  it('keeps the user payload schemas strict so no extra field rides along', () => {
    expect(
      rtUserPayloadSchema('job.progress')?.safeParse({ job_id: ID, step: 'a', pct: 5 }).success,
    ).toBe(true);
    expect(
      rtUserPayloadSchema('job.progress')?.safeParse({ job_id: ID, step: 'a', pct: 5, budget: 1 })
        .success,
    ).toBe(false);
    expect(rtUserPayloadSchema('toString')).toBeUndefined();
  });
});
