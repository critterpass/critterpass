import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { commandEnvelopeSchema, isIanaTimeZone } from '../src/commands/envelope';
import { generateUuidV7 } from '../src/ids';

const payloadSchema = z.object({ note: z.string() });
const schema = commandEnvelopeSchema(payloadSchema);

function validEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    op_id: generateUuidV7(),
    cmd: 'cast_ballot',
    v: 1,
    actor: { uid: generateUuidV7(), via: 'app' },
    device: { id: 'device-1', platform: 'ios', app_version: '1.0.0', tz: 'Asia/Ho_Chi_Minh' },
    client_ts: new Date().toISOString(),
    payload: { note: 'hello' },
    ...overrides,
  };
}

describe('commandEnvelopeSchema', () => {
  it('accepts a well-formed envelope', () => {
    const result = schema.safeParse(validEnvelope());
    expect(result.success).toBe(true);
  });

  it('accepts an envelope with base_version set', () => {
    expect(schema.safeParse(validEnvelope({ base_version: 3 })).success).toBe(true);
  });

  it('rejects a non-UUIDv7 op_id', () => {
    expect(
      schema.safeParse(validEnvelope({ op_id: '550e8400-e29b-41d4-a716-446655440000' })).success,
    ).toBe(false);
  });

  it('rejects a cmd name that is not snake_case verb_noun', () => {
    expect(schema.safeParse(validEnvelope({ cmd: 'vote' })).success).toBe(false);
    expect(schema.safeParse(validEnvelope({ cmd: 'CastBallot' })).success).toBe(false);
  });

  it('rejects a schema version other than 1', () => {
    expect(schema.safeParse(validEnvelope({ v: 2 })).success).toBe(false);
  });

  it('rejects an unknown actor.via', () => {
    expect(
      schema.safeParse(validEnvelope({ actor: { uid: generateUuidV7(), via: 'carrier_pigeon' } }))
        .success,
    ).toBe(false);
  });

  it('rejects a device.tz that is not an IANA time zone', () => {
    expect(
      schema.safeParse(
        validEnvelope({
          device: { id: 'd', platform: 'ios', app_version: '1.0.0', tz: 'not-a-timezone' },
        }),
      ).success,
    ).toBe(false);
  });

  it('accepts a device.tz link such as GMT and hands handlers the canonical zone', () => {
    const parsed = schema.safeParse(
      validEnvelope({ device: { id: 'd', platform: 'ios', app_version: '1.0.0', tz: 'GMT' } }),
    );
    expect(parsed.success).toBe(true);
    expect(parsed.data?.device.tz).toBe('Etc/GMT');
  });

  it('rejects base_version 0 or negative', () => {
    expect(schema.safeParse(validEnvelope({ base_version: 0 })).success).toBe(false);
    expect(schema.safeParse(validEnvelope({ base_version: -1 })).success).toBe(false);
  });

  it('rejects a payload that fails its own schema', () => {
    expect(schema.safeParse(validEnvelope({ payload: { note: 42 } })).success).toBe(false);
  });
});

describe('isIanaTimeZone', () => {
  it('accepts canonical names and older links to the same zone', () => {
    expect(isIanaTimeZone('Asia/Ho_Chi_Minh')).toBe(true);
    expect(isIanaTimeZone('Asia/Saigon')).toBe(true);
    expect(isIanaTimeZone('UTC')).toBe(true);
    expect(isIanaTimeZone('GMT')).toBe(true);
    expect(isIanaTimeZone('Etc/UTC')).toBe(true);
  });

  it('rejects bare offsets and nonsense', () => {
    expect(isIanaTimeZone('+07:00')).toBe(false);
    expect(isIanaTimeZone('bogus')).toBe(false);
    expect(isIanaTimeZone('Asia/Bogus_City')).toBe(false);
  });
});
