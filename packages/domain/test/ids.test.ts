import { describe, expect, it } from 'vitest';

import { DomainError } from '../src/errors';
import { generateUuidV7, isUuidV7, parseUuidV7, uuidV7Schema } from '../src/ids';

describe('generateUuidV7', () => {
  it('produces a structurally valid UUIDv7', () => {
    const id = generateUuidV7();
    expect(isUuidV7(id)).toBe(true);
  });

  it('is monotonic even when many ids are generated within the same millisecond', () => {
    const ids = Array.from({ length: 500 }, () => generateUuidV7());
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('embeds a timestamp close to generation time', () => {
    const before = Date.now();
    const id = generateUuidV7();
    const after = Date.now();
    const { timestampMs } = parseUuidV7(id);
    expect(timestampMs).toBeGreaterThanOrEqual(before);
    expect(timestampMs).toBeLessThanOrEqual(after);
  });
});

describe('isUuidV7', () => {
  it('rejects a v4 uuid', () => {
    expect(isUuidV7('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('rejects non-uuid strings', () => {
    expect(isUuidV7('not-a-uuid')).toBe(false);
    expect(isUuidV7(1234)).toBe(false);
  });
});

describe('parseUuidV7', () => {
  it('throws a VALIDATION DomainError for non-UUIDv7 input', () => {
    expect(() => parseUuidV7('not-a-uuid')).toThrow(DomainError);

    let caught: unknown;
    try {
      parseUuidV7('not-a-uuid');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DomainError);
    expect((caught as DomainError).code).toBe('VALIDATION');
  });
});

describe('uuidV7Schema', () => {
  it('accepts a generated id and rejects a v4 uuid', () => {
    expect(uuidV7Schema.safeParse(generateUuidV7()).success).toBe(true);
    expect(uuidV7Schema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(false);
  });
});
