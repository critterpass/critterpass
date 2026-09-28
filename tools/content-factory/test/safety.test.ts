import { describe, expect, it } from 'vitest';

import { committedItems } from '../src/committed';
import { numberInSource } from '../src/kinds/emergency/sources';
import { toEmergency } from '../src/kinds/emergency';
import { toFacility } from '../src/kinds/facilities';
import { toInsurance } from '../src/kinds/insurance';
import { validateCommitted } from '../src/pipeline';
import { suppliersNamed } from '../src/suppliers';

const hit = {
  url: 'https://www.example.gov/emergency',
  title: 'Emergency services',
  content:
    'In an emergency dial 112 for ambulance, police and fire. Tourist police: 1771. Bali International Hospital, Jl. Bypass, tel (0361) 300-3000.',
};
const now = new Date('2026-09-28T00:00:00Z');

describe('safety records keep only what their source states', () => {
  it('matches numbers as whole digit runs', () => {
    expect(numberInSource(hit, '112')).toBe(true);
    expect(numberInSource(hit, '0361 3003000')).toBe(true);
    expect(numberInSource(hit, '11')).toBe(false);
  });

  it('drops numbers the cited page does not state and records it unverified', () => {
    const input = { country: 'ID', name: 'Indonesia', hits: [hit] };
    const record = toEmergency(
      input,
      {
        source_url: hit.url,
        numbers: [
          { service: 'general', number: '112', label: 'Ambulance, police, fire' },
          { service: 'police', number: '110', label: 'Police' },
        ],
      },
      now,
    );
    expect(record?.numbers.map((n) => n.number)).toEqual(['112']);
    expect(record?.verified_at).toBeNull();
    expect(
      toEmergency(
        input,
        {
          source_url: 'https://made-up.example',
          numbers: [{ service: 'general', number: '112', label: 'x' }],
        },
        now,
      ),
    ).toBeNull();
  });

  it('keeps a facility only when its source names it', () => {
    const input = { destination: 'bali', code: 'id', hits: [hit] };
    const base = {
      kind: 'hospital' as const,
      address: 'Jl. Bypass',
      phone: '(0361) 300-3000',
      open_24h: true,
      lat: -8.6789,
      lng: 115.2345,
      source_url: hit.url,
    };
    expect(toFacility(input, { ...base, name: 'Bali International Hospital' }, now)?.phone).toBe(
      '0361 300-3000',
    );
    expect(toFacility(input, { ...base, name: 'Invented Medical Centre' }, now)).toBeNull();
  });

  it('keeps only cited sources in insurance guidance and spots named suppliers', () => {
    const item = toInsurance(
      { country: 'ID', name: 'Indonesia', hits: [hit] },
      {
        title: 'Travel insurance in Indonesia',
        body_md: 'Check medical cover.',
        claim_checklist: ['a', 'b', 'c'],
        source_urls: [hit.url, 'https://x.example'],
      },
    );
    expect(item?.source_urls).toEqual([hit.url]);
    expect(item?.legal_reviewed).toBe(false);
    expect(suppliersNamed('Book it on Booking.com or plan a trip')).toEqual(['booking.com']);
  });

  it('commit sourced, unverified records for review', () => {
    const numbers = committedItems('emergency');
    expect(numbers.length).toBeGreaterThanOrEqual(55);
    expect(
      numbers.every((n) => n.verified_at === null && n.source_url.startsWith('https://')),
    ).toBe(true);
    const facilities = committedItems('facilities');
    for (const city of ['bali', 'kyoto', 'iceland', 'mexico-city', 'lisbon', 'cusco']) {
      expect(
        facilities.some((f) => f.destination === city && f.kind === 'hospital'),
        city,
      ).toBe(true);
      expect(
        facilities.some((f) => f.destination === city && f.kind === 'pharmacy'),
        city,
      ).toBe(true);
    }
    for (const kind of ['emergency', 'facilities', 'insurance'] as const) {
      for (const { report } of validateCommitted(kind))
        expect(report.severity, kind).not.toBe('fail');
    }
  });
});
