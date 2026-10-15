/** Held mail asks for the emailed code only while one that was sent is still good. */
import { describe, expect, it } from '@jest/globals';

import { linkCodeWasSent } from '../link-code/link-code-model';

const NOW = new Date('2026-10-02T10:00:00Z');

describe('held mail', () => {
  it('asks for the code only while one that was emailed is still good', () => {
    expect(linkCodeWasSent('2026-10-03 00:23:00.123456Z', NOW)).toBe(true);
    expect(linkCodeWasSent('2026-10-03T00:23:00Z', NOW)).toBe(true);
    expect(linkCodeWasSent('2026-10-02 09:59:59Z', NOW)).toBe(false);
    expect(linkCodeWasSent(null, NOW)).toBe(false);
    expect(linkCodeWasSent(undefined, NOW)).toBe(false);
    expect(linkCodeWasSent('not a time', NOW)).toBe(false);
  });
});
