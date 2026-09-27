import { describe, expect, it } from 'vitest';

import { parseGvpWeekly } from '../../../src/travel-data/hazards/gvp';
import { parseImoVona } from '../../../src/travel-data/hazards/imo';
import { jmaPrefectureFile, parseJmaWarnings } from '../../../src/travel-data/hazards/jma';
import { parseMagma } from '../../../src/travel-data/hazards/magma';
import { readHazardFixture } from '../travel-fixtures';

describe('MAGMA Indonesia levels (recorded page)', () => {
  const readings = parseMagma(readHazardFixture('magma-tingkat-aktivitas.html'));

  it("reads every volcano under its level, including Bali's and Lombok's", () => {
    const bySubject = new Map(readings.map((reading) => [reading.subject, reading]));
    for (const name of ['Batur', 'Agung']) {
      expect(bySubject.get(name)).toMatchObject({
        source: 'magma',
        kind: 'volcano',
        level: 1,
        level_label: 'Level I (Normal)',
        issued_at: null,
      });
    }
    expect(bySubject.get('Rinjani')?.level).toBe(2);
    expect(bySubject.get('Merapi')).toMatchObject({ level: 3, level_label: 'Level III (Siaga)' });
    expect(bySubject.get('Batur')?.source_url).toMatch(
      /^https:\/\/magma\.esdm\.go\.id\/v1\/gunung-api\/laporan\/\d+$/,
    );
  });

  it('fails loudly on a page with no levels (format change)', () => {
    expect(() => parseMagma('<html><body>maintenance</body></html>')).toThrow();
  });
});

describe('Icelandic Met Office colour codes (recorded VONA page)', () => {
  it("takes each volcano's newest notice as its current code", () => {
    const readings = new Map(
      parseImoVona(readHazardFixture('imo-vona-notifications.html')).map((r) => [r.subject, r]),
    );
    expect(readings.get('Bárðarbunga')).toMatchObject({
      level: 1,
      level_label: 'Green',
      issued_at: new Date('2026-06-15T12:42:00Z'),
    });
    expect(readings.get('Reykjanes')).toMatchObject({ level: 2, level_label: 'Yellow' });
    expect(readings.get('Reykjanes')?.source_url).toMatch(/\?nr=636$/);
  });
});

describe('JMA warnings (recorded Kyoto prefecture file)', () => {
  it('maps a file where every advisory was lifted to level 1 for the watched area', () => {
    const raw: unknown = JSON.parse(readHazardFixture('jma-warning-260000.json'));
    expect(parseJmaWarnings(raw, ['260010', '999999'])).toEqual([
      expect.objectContaining({
        subject: '260010',
        level: 1,
        level_label: 'No warnings in force',
        issued_at: new Date('2026-05-26T12:09:00Z'),
      }),
    ]);
    expect(jmaPrefectureFile('260010')).toBe(
      'https://www.jma.go.jp/bosai/warning/data/warning/260000.json',
    );
  });
});

describe('GVP weekly report (recorded RSS)', () => {
  it('reads each report item with its category and an eight-day expiry', () => {
    const readings = parseGvpWeekly(readHazardFixture('gvp-weekly-volcano-rss.xml', 'latin1'));
    expect(readings).toHaveLength(20);
    const merapi = readings.find((reading) => reading.subject === 'Merapi');
    expect(merapi).toMatchObject({
      source: 'gvp',
      level: 3,
      level_label: 'Continuing Eruptive Activity',
      issued_at: new Date('2026-09-17T05:20:04Z'),
      expires_at: new Date('2026-09-25T05:20:04Z'),
    });
    expect(readings.find((reading) => reading.subject === 'Lewotobi')?.level).toBe(2);
  });
});
