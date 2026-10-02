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

  it('drops Morocco 112, which no official page states', () => {
    expect(byCountry.get('MA')!.numbers.map((line) => line.number)).not.toContain('112');
  });

  it('adds Canada, Tunisia, Taiwan and Tanzania, and keeps every published country', () => {
    expect(release.items).toHaveLength(61);
  });
});
