/**
 * UUIDv7 (RFC 9562): a 48-bit millisecond timestamp followed by a version/variant nibble and 74
 * bits of randomness, so ids sort by creation time. `generateUuidV7()` is monotonic within a
 * process: repeated calls in the same millisecond increment a 12-bit counter (RFC 9562 §6.2 method
 * 1) instead of drawing fresh randomness, so it never returns an earlier-sorting id than the call
 * before it. Web Crypto (`crypto.getRandomValues`) only, so this behaves the same in Node,
 * Cloudflare Workers and React Native (with its crypto polyfill).
 */
import { z } from 'zod';

import { DomainError } from './errors';

const MAX_COUNTER = 0x0fff;
const VERSION_NIBBLE = 0x70;
const VARIANT_BITS = 0x80;

let lastTimestampMs = -1;
let counter = 0;

function randomCounterSeed(): number {
  return (crypto.getRandomValues(new Uint16Array(1))[0] ?? 0) & MAX_COUNTER;
}

function nextTimestampAndCounter(): { timestampMs: number; counter: number } {
  const now = Date.now();
  if (now > lastTimestampMs) {
    lastTimestampMs = now;
    counter = randomCounterSeed();
  } else {
    counter += 1;
    if (counter > MAX_COUNTER) {
      lastTimestampMs += 1;
      counter = randomCounterSeed();
    }
  }
  return { timestampMs: lastTimestampMs, counter };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function formatUuid(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Generates a new UUIDv7, monotonic with every other id generated in this process. */
export function generateUuidV7(): string {
  const { timestampMs, counter: randA } = nextTimestampAndCounter();
  const bytes = new Uint8Array(16);

  let t = timestampMs;
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = t % 256;
    t = Math.floor(t / 256);
  }

  bytes[6] = VERSION_NIBBLE | ((randA >> 8) & 0x0f);
  bytes[7] = randA & 0xff;

  const randB = crypto.getRandomValues(new Uint8Array(8));
  bytes[8] = VARIANT_BITS | ((randB[0] ?? 0) & 0x3f);
  for (let i = 1; i < 8; i += 1) {
    bytes[8 + i] = randB[i] ?? 0;
  }

  return formatUuid(toHex(bytes));
}

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Structural check only: version nibble is 7, variant bits are `10xx`, hyphen layout matches. */
export function isUuidV7(value: unknown): value is string {
  return typeof value === 'string' && UUID_V7_PATTERN.test(value);
}

export interface UuidV7Parts {
  readonly timestampMs: number;
  readonly date: Date;
}

/** Extracts the embedded millisecond timestamp; throws `VALIDATION` for anything not a UUIDv7. */
export function parseUuidV7(value: string): UuidV7Parts {
  if (!isUuidV7(value)) {
    throw new DomainError('VALIDATION', { reason: 'not a UUIDv7', value });
  }
  const hex = value.replaceAll('-', '');
  let timestampMs = 0;
  for (let i = 0; i < 12; i += 2) {
    timestampMs = timestampMs * 256 + parseInt(hex.slice(i, i + 2), 16);
  }
  return { timestampMs, date: new Date(timestampMs) };
}

/** For zod schemas that need a UUIDv7 specifically (e.g. `CommandEnvelope.op_id`). */
export const uuidV7Schema = z.string().refine(isUuidV7, { message: 'must be a UUIDv7' });
