import { describe, expect, it } from 'vitest';

import { planItemSnapshotSchema } from '../../src/plan/plan-item';
import { canonicalTz, timeZoneIdSchema } from '../../src/time/canonical-tz';

describe('canonicalTz', () => {
  it('maps backward-compatibility aliases and passes canonical ids through', () => {
    expect(canonicalTz('Asia/Saigon')).toBe('Asia/Ho_Chi_Minh');
    expect(canonicalTz('Asia/Ho_Chi_Minh')).toBe('Asia/Ho_Chi_Minh');
    expect(canonicalTz('constructor')).toBe('constructor');
  });
});

describe('timeZoneIdSchema', () => {
  it('parses an alias to its canonical id', () => {
    expect(timeZoneIdSchema.parse('Asia/Calcutta')).toBe('Asia/Kolkata');
    expect(planItemSnapshotSchema.parse({ tz: 'Asia/Saigon' }).tz).toBe('Asia/Ho_Chi_Minh');
  });

  it('accepts Etc offsets and three-part ids', () => {
    expect(timeZoneIdSchema.parse('Etc/GMT-7')).toBe('Etc/GMT-7');
    expect(timeZoneIdSchema.parse('America/Argentina/Buenos_Aires')).toBe(
      'America/Argentina/Buenos_Aires',
    );
    expect(timeZoneIdSchema.parse('UTC')).toBe('Etc/UTC');
  });

  it('rejects abbreviations, POSIX strings and offset suffixes', () => {
    for (const bad of ['', 'ICT', 'UTC+3', 'Asia/Tokyo+5', 'asia/tokyo', 'Etc/GMT+13']) {
      expect(timeZoneIdSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});
