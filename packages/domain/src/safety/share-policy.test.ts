import { describe, expect, it } from 'vitest';

import { generateUuidV7 } from '../ids';
import {
  extendedHelpShareEnd,
  helpShareEnd,
  isSosStale,
  sosOpAgeMs,
  uuidV7Millis,
} from './share-policy';

const MINUTE = 60_000;
const now = new Date('2026-10-01T03:00:00Z');

/** A UUIDv7 whose time is `ms`. */
function uuidAt(ms: number): string {
  const hex =
    Math.floor(ms).toString(16).padStart(12, '0') + generateUuidV7().replaceAll('-', '').slice(12);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

describe('help share windows', () => {
  it('opens for an hour and extends an hour at a time, never past three hours ahead', () => {
    expect(helpShareEnd(now).getTime() - now.getTime()).toBe(60 * MINUTE);
    let end = helpShareEnd(now);
    for (let i = 0; i < 5; i += 1) end = extendedHelpShareEnd(end, now);
    expect(end.getTime() - now.getTime()).toBe(180 * MINUTE);
  });

  it('extends a share that is about to end from now, not from its end', () => {
    const almost = new Date(now.getTime() - 5 * MINUTE);
    expect(extendedHelpShareEnd(almost, now).getTime() - now.getTime()).toBe(60 * MINUTE);
  });
});

describe('SOS staleness', () => {
  it('reads the time a UUIDv7 was minted', () => {
    expect(uuidV7Millis(uuidAt(now.getTime()))).toBe(now.getTime());
    expect(uuidV7Millis('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('is stale only past the limit, measured from the earlier of op id and client time', () => {
    const queued = now.getTime() - 11 * MINUTE;
    const age = sosOpAgeMs(uuidAt(queued), new Date(now.getTime()), now);
    expect(age).toBe(11 * MINUTE);
    expect(isSosStale(age, 10)).toBe(true);
    expect(isSosStale(10 * MINUTE, 10)).toBe(false);
  });

  it('corrects for a device clock running behind and never makes an op older than it is', () => {
    const deviceBehind = now.getTime() - 15 * MINUTE;
    expect(sosOpAgeMs(uuidAt(deviceBehind), new Date(deviceBehind), now, 15 * MINUTE)).toBe(0);
    const ahead = now.getTime() + 20 * MINUTE;
    expect(sosOpAgeMs(uuidAt(ahead), new Date(ahead), now)).toBe(0);
  });
});
