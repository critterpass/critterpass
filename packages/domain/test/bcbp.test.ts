import { describe, expect, it } from 'vitest';

import { BcbpError, decodeBcbp, flightDate } from '../src/bcbp/decode';

// Resolution 792 (BCBP Implementation Guide) sample strings.
const MANDATORY_ONLY = 'M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100';
const TWO_LEGS =
  'M2DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J003A0027 167>5321WW1325BAC 0014123456002001412346700100141234789012A0141234567890 1AC AC 1234567890123    4PCYLX58ZDEF456 FRAGVALH 3664 327C012C0002 12E2A0140987654321 1AC AC 1234567890123    3PCNWQ^164GIWVC5EH7JNT684FVNJ91W2QA4DVN5J8K4F0L0GEQ3DF5TGBN8709HKT5D3DW3GBHFCVHMY7J5T6HFR41W2QA4DVN5J8K4F0L0GE';

describe('BCBP', () => {
  it('decodes the mandatory items of a one-leg pass exactly', () => {
    expect(decodeBcbp(MANDATORY_ONLY)).toEqual({
      passengerName: 'DESMARAIS/LUC',
      electronicTicket: true,
      baggageTags: [],
      legs: [
        {
          pnr: 'ABC123',
          from: 'YUL',
          to: 'FRA',
          carrier: 'AC',
          flightNumber: '834',
          julianDate: 326,
          compartment: 'J',
          seat: '1A',
          checkInSequence: '25',
          passengerStatus: '1',
        },
      ],
    });
  });

  it('decodes both legs, the unique and repeated conditional items and the security data', () => {
    const pass = decodeBcbp(TWO_LEGS);
    expect(pass).toMatchObject({
      version: '5',
      passengerDescription: '1',
      checkInSource: 'W',
      boardingPassSource: 'W',
      dateOfIssue: '1325',
      documentType: 'B',
      issuer: 'AC',
      baggageTags: ['0014123456002', '0014123467001', '0014123478901'],
    });
    expect(pass.securityData?.type).toBe('1');
    expect(pass.securityData?.data).toMatch(/^GIWVC5EH7JNT684FVNJ9/u);
    expect(
      pass.legs.map((leg) => [leg.carrier, leg.flightNumber, leg.from, leg.to, leg.seat]),
    ).toEqual([
      ['AC', '834', 'YUL', 'FRA', '3A'],
      ['LH', '3664', 'FRA', 'GVA', '12C'],
    ]);
    expect(pass.legs[0]).toMatchObject({
      airlineNumericCode: '014',
      documentSerial: '1234567890',
      marketingCarrier: 'AC',
      frequentFlyerAirline: 'AC',
      frequentFlyerNumber: '1234567890123',
      freeBaggage: '4PC',
      fastTrack: 'Y',
      airlineData: 'LX58Z',
    });
    expect(pass.legs[1]).toMatchObject({
      airlineNumericCode: '014',
      freeBaggage: '3PC',
      fastTrack: 'N',
      airlineData: 'WQ',
    });
  });

  it('refuses what is not a format M pass or ends early', () => {
    expect(() => decodeBcbp('S1DESMARAIS')).toThrow(BcbpError);
    expect(() => decodeBcbp(MANDATORY_ONLY.slice(0, 40))).toThrow(BcbpError);
  });

  it('dates a leg in the year that puts it just after the pass was read', () => {
    expect(flightDate(326, new Date('2026-11-01T00:00:00Z'))).toBe('2026-11-22');
    expect(flightDate(3, new Date('2026-12-28T00:00:00Z'))).toBe('2027-01-03');
  });
});
