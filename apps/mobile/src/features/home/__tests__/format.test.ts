import { describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { loadCatalog } from '@cp/i18n';

import { shortAge } from '../format';

const NOW = new Date('2026-09-29T12:00:00Z');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

describe('shortAge', () => {
  it('reads minutes, hours and days in the compact form', async () => {
    i18n.loadAndActivate({ locale: 'en', messages: await loadCatalog('en', 'home') });
    expect(shortAge(ago(0), NOW)).toBe('1m');
    expect(shortAge(ago(12), NOW)).toBe('12m');
    expect(shortAge(ago(120), NOW)).toBe('2h');
    expect(shortAge(ago(3 * 24 * 60), NOW)).toBe('3d');
  });

  it('never counts in seconds, in Vietnamese either', async () => {
    i18n.loadAndActivate({ locale: 'vi', messages: await loadCatalog('vi', 'home') });
    expect(shortAge(ago(12), NOW)).toBe('12 phút');
    expect(shortAge(ago(120), NOW)).toBe('2 giờ');
    expect(shortAge(ago(2 * 24 * 60), NOW)).toBe('2 ngày');
  });
});
