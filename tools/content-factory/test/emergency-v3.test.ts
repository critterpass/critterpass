/**
 * The emergency numbers correction (batch 2026-10-02-emergency-01): every record it changes cites
 * the official government or emergency-service page that states its numbers, and Help leads each
 * of those countries with its all-services number, else the ambulance (never a hotline filed as
 * `other`). The evidence for each row is in the lane report the founder's delegate approved from.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { loadRelease } from '@cp/content';
import { emergencyNumbersFor, type EmergencyLine } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { FACTORY_DIR } from '../src/work';

const release = loadRelease(
  JSON.parse(
    readFileSync(
      path.join(FACTORY_DIR, 'batches', 'emergency', '2026-10-02-emergency-01.json'),
      'utf8',
    ),
  ),
  'emergency',
);
const byCountry = new Map(release.items.map((item) => [item.country, item]));

/** Government, emergency-service or national tourist-board hosts. */
const OFFICIAL =
  /(^|\.)(gov\.vn|e\.gov\.ph|gov\.om|gov\.br|chile\.gob\.cl|gov\.co|incredibleindia\.gov\.in|westerncape\.gov\.za|malaysia\.gov\.my|government\.nl|travel\.gc\.ca|crtc\.gc\.ca)$/u;

const LEADS: Readonly<Record<string, string>> = {
  VN: '115',
  PH: '911',
  OM: '9999',
  BR: '192',
  CL: '131',
  IN: '112',
  ZA: '112',
  MY: '999',
  NL: '112',
  MA: '150',
  AU: '000',
  CO: '123',
  CA: '911',
  TN: '190',
  TW: '119',
  TZ: '112',
};

describe('emergency numbers correction', () => {
  it('cites an official page for every record it changes, read and verified', () => {
    for (const country of Object.keys(LEADS)) {
      const item = byCountry.get(country);
      expect(item, country).toBeDefined();
      expect(OFFICIAL.test(new URL(item!.source_url).hostname), country).toBe(true);
      expect(item!.retrieved_on, country).toBe('2026-10-02');
      expect(item!.verified_at, country).not.toBeNull();
    }
  });

  it('leads each country with its all-services number, else the ambulance', () => {
    for (const [country, lead] of Object.entries(LEADS)) {
      const lines = byCountry.get(country)!.numbers as readonly EmergencyLine[];
      expect(emergencyNumbersFor(lines).general, country).toBe(lead);
    }
  });

  it("carries only the numbers each record's own cited page states", () => {
    const ON_PAGE: Readonly<Record<string, readonly string[]>> = {
      VN: ['112', '113', '114', '115'],
      PH: ['117', '143', '911'],
      OM: ['9999'],
      BR: ['190', '192', '193', '911'],
      CL: ['131', '132', '133', '134', '136', '137', '138', '139'],
      IN: [
        '100',
        '101',
        '102',
        '104',
        '108',
        '112',
        '1071',
        '1073',
        '1091',
        '1092',
        '1322',
        '1363',
      ],
      ZA: ['10111', '10177', '107', '112'],
      MY: ['999'],
      NL: ['112'],
      MA: ['150', '190'],
      AU: ['000'],
      CO: ['123'],
      CA: ['911'],
      TN: ['190', '193', '197', '198'],
      TW: ['110', '119'],
      TZ: ['112'],
    };
    for (const [country, numbers] of Object.entries(ON_PAGE)) {
      const held = [...new Set(byCountry.get(country)!.numbers.map((line) => line.number))].sort();
      expect(held, country).toEqual([...numbers].sort());
    }
  });

  it('adds Canada, Tunisia, Taiwan and Tanzania, and keeps every published country', () => {
    expect(release.items).toHaveLength(61);
  });
});
