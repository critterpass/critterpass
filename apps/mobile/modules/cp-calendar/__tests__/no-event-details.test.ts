/**
 * Only date-level states may leave the device: the native code must read nothing of an event but
 * its times, all-day flag, availability and status, and the module must still work (as "not
 * available") in a build without it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, jest } from '@jest/globals';

const moduleDir = join(__dirname, '..');

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    // Build output of the host-side `swift test` run, never shipped.
    if (entry === '.build') return [];
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const swift = filesUnder(join(moduleDir, 'ios'))
  .filter((path) => path.endsWith('.swift') && !path.includes(join('ios', 'Tests')))
  .map((path) => ({ path, source: readFileSync(path, 'utf8') }));
const kotlin = filesUnder(join(moduleDir, 'android', 'src', 'main'))
  .filter((path) => path.endsWith('.kt'))
  .map((path) => ({ path, source: readFileSync(path, 'utf8') }));

describe('calendar reads carry no event details', () => {
  it('Swift reads no title, notes, place, URL or people', () => {
    for (const { path, source } of swift) {
      expect({
        path,
        hit: /\.(title|notes|location|structuredLocation|url|attendees|organizer)\b/u.test(source),
      }).toEqual({ path, hit: false });
    }
  });

  it('Kotlin queries no title, description, place or attendees', () => {
    for (const { path, source } of kotlin) {
      expect({
        path,
        hit: /\b(TITLE|DESCRIPTION|EVENT_LOCATION|ATTENDEE\w*|ORGANIZER|Attendees)\b/u.test(source),
      }).toEqual({ path, hit: false });
    }
  });

  it('declares only the calendar read permission on Android', () => {
    const manifest = readFileSync(
      join(moduleDir, 'android', 'src', 'main', 'AndroidManifest.xml'),
      'utf8',
    );
    expect(manifest.match(/android:name="[^"]+"/gu)).toEqual([
      'android:name="android.permission.READ_CALENDAR"',
    ]);
  });

  it('returns nothing and reports unavailable without the native module', async () => {
    jest.resetModules();
    jest.doMock('../src/CpCalendarModule', () => ({ nativeCpCalendarModule: null }));
    const calendar = await import('../index');
    expect(calendar.isDeviceCalendarAvailable()).toBe(false);
    expect(calendar.hasCalendarAccess()).toBe(false);
    await expect(
      calendar.readBusyDays({ from: '2027-04-01', to: '2027-04-02', tz: 'UTC' }, true),
    ).resolves.toEqual([]);
  });
});
