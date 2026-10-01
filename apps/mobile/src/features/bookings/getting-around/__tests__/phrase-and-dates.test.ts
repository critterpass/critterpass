/**
 * The driver phrase's gloss names the place in every language we ship, and check dates on the
 * estimate sheet are the calendar day the data says, whatever the reader's zone.
 */
import { describe, expect, it } from '@jest/globals';
import { setupI18n, type Messages } from '@lingui/core';

import { loadCatalog } from '@cp/i18n';

import { durationMessage } from '../duration';
import { formatCheckedDate } from '../EstimateSheet';
import { glossMessage } from '../phrase';

/** Placeholder names a compiled message uses (`["place"]` tokens, at any depth). */
function placeholders(message: unknown): string[] {
  if (!Array.isArray(message)) return [];
  return message.flatMap((part: unknown) =>
    Array.isArray(part) && typeof part[0] === 'string'
      ? [part[0], ...placeholders(part.slice(1))]
      : placeholders(part),
  );
}

describe('the driver phrase gloss', () => {
  it.each(['en', 'vi'])('names the place in %s', async (locale) => {
    const messages: Messages = await loadCatalog(locale, 'suppliers/app');
    const i18n = setupI18n({ locale, messages: { [locale]: messages } });
    const gloss = i18n._(glossMessage('Kinkaku-ji'));
    expect(gloss).toContain('Kinkaku-ji');
    expect(gloss).not.toMatch(/\s[.。]$|\{|\}/u);
  });

  it('uses the same placeholders in every translated supplier message', async () => {
    const en = await loadCatalog('en', 'suppliers/app');
    const vi = await loadCatalog('vi', 'suppliers/app');
    for (const [id, message] of Object.entries(vi)) {
      expect({ id, names: placeholders(message).sort() }).toEqual({
        id,
        names: placeholders(en[id]).sort(),
      });
    }
  });
});

describe('check dates', () => {
  it('keeps a date-only value on its calendar day in a zone behind UTC', () => {
    expect(formatCheckedDate('2026-09-30', 'en-US', 'America/Los_Angeles')).toBe('Sep 30, 2026');
    expect(formatCheckedDate('2026-09-30', 'en-US', 'Pacific/Honolulu')).toBe('Sep 30, 2026');
  });

  it('shows a timestamp in the reader’s zone', () => {
    expect(formatCheckedDate('2026-09-30T03:00:00Z', 'en-US', 'America/Los_Angeles')).toBe(
      'Sep 29, 2026',
    );
  });
});

describe('the header duration', () => {
  it.each([
    ['en', 28, '28m'],
    ['en', 65, '1h 05m'],
    ['en', 60, '1h 00m'],
    ['vi', 28, '28 phút'],
    ['vi', 65, '1 giờ 05 phút'],
  ])('in %s, %i minutes read %s', async (locale, minutes, expected) => {
    const messages: Messages = await loadCatalog(locale, 'suppliers/app');
    const i18n = setupI18n({ locale, messages: { [locale]: messages } });
    expect(i18n._(durationMessage(minutes))).toBe(expected);
  });
});
