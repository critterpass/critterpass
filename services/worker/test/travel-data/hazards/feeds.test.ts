import { describe, expect, it } from 'vitest';

import {
  parseCenapredArchive,
  parseCenapredReport,
} from '../../../src/travel-data/hazards/cenapred';
import { parseGdacsVolcanoes } from '../../../src/travel-data/hazards/gdacs';
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

describe('GDACS volcano events (recorded event lists)', () => {
  it('reads a current eruption with its alert, report link and a seven-day expiry', () => {
    const readings = parseGdacsVolcanoes(
      readHazardFixture('gdacs-volcano-events.json'),
      new Date('2026-09-08T00:00:00Z'),
    );
    expect(readings).toEqual([
      {
        source: 'gdacs',
        kind: 'volcano',
        subject: 'Krakatau',
        level: 3,
        level_label: 'Orange alert',
        headline:
          'Krakatau (Indonesia) eruption: orange alert from the Global Disaster Alert and Coordination System, GDACS',
        source_url: 'https://www.gdacs.org/report.aspx?eventid=1000148&episodeid=1&eventtype=VO',
        issued_at: new Date('2026-09-04T21:00:00Z'),
        expires_at: new Date('2026-09-11T21:00:00Z'),
      },
    ]);
  });

  it('drops every eruption once its last update is a week old', () => {
    const json = readHazardFixture('gdacs-volcano-events.json');
    expect(parseGdacsVolcanoes(json, new Date('2026-09-29T00:00:00Z'))).toEqual([]);
  });

  it('keeps only the newest event of a volcano listed several times', () => {
    const readings = parseGdacsVolcanoes(
      readHazardFixture('gdacs-volcano-events-since-2020.json'),
      new Date('2026-03-18T00:00:00Z'),
    );
    expect(readings.map((reading) => [reading.subject, reading.issued_at])).toEqual([
      ['Kanlaon', new Date('2026-03-15T10:54:00Z')],
    ]);
  });

  it('refuses a response that is not an event list', () => {
    expect(() => parseGdacsVolcanoes('{"error":"busy"}', new Date())).toThrow(/no features/);
  });
});

describe('CENAPRED Popocatépetl light (recorded gob.mx pages)', () => {
  const post = parseCenapredArchive(readHazardFixture('cenapred-archivo-articulos.txt'));

  it('finds the newest Popocatépetl report in the article archive', () => {
    expect(post).toEqual({
      url: 'https://www.gob.mx/cenapred/es/articulos/monitoreo-del-volcan-popocatepetl-hoy-28-de-septiembre-de-2026?idiom=es',
      published_at: new Date('2026-09-28T16:19:00Z'),
    });
  });

  it('reads the alert light as the level, expiring three days after the report', () => {
    const reading = parseCenapredReport(
      readHazardFixture('cenapred-popocatepetl-2026-09-28.html'),
      post,
    );
    expect(reading).toEqual({
      source: 'cenapred',
      kind: 'volcano',
      subject: 'Popocatepetl',
      level: 2,
      level_label: 'Amarillo Fase 2',
      headline: 'Popocatépetl volcanic alert light: Amarillo Fase 2 (CENAPRED)',
      source_url: post.url,
      issued_at: new Date('2026-09-28T16:19:00Z'),
      expires_at: new Date('2026-10-01T16:19:00Z'),
    });
  });

  it('maps every stage of the light', () => {
    const level = (light: string) =>
      parseCenapredReport(
        `<p>El Sem&aacute;foro de Alerta Volc&aacute;nica del Popocat&eacute;petl se encuentra en ${light}.</p>`,
        post,
      ).level;
    expect(
      ['Verde', 'Amarillo Fase 1', 'Amarillo Fase 2', 'Amarillo Fase 3', 'Rojo Fase 1'].map(level),
    ).toEqual([1, 2, 2, 3, 4]);
    expect(() => parseCenapredReport('<p>Sin reporte</p>', post)).toThrow(/no alert light/);
  });
});
