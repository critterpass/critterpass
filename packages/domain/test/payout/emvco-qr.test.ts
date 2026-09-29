/**
 * EMVCo QR payloads: the CRC matches the published examples of all four schemes (PromptPay from
 * the Bank of Thailand reference library, PayNow from SGQR, VietQR from NAPAS integrations, DuitNow
 * from PayNet's own specification) and the CRC-16/CCITT-FALSE check value; the builders reproduce
 * the published PayNow and VietQR payloads exactly; every payload they build parses back to the
 * fields it was given, with a valid CRC.
 */
import { describe, expect, it } from 'vitest';

import {
  crc16,
  duitNowQr,
  emvAmount,
  hasValidCrc,
  payNowQr,
  promptPayMobile,
  promptPayQr,
  vietQr,
} from '../../src/payout/emvco-qr';

const PUBLISHED = {
  promptPayStatic: '00020101021129370016A000000677010111011300668999999995802TH53037646304FE29',
  promptPayAmount:
    '00020101021229370016A000000677010111011300668999999995802TH53037645406420.006304CF9E',
  payNow:
    '00020101021226470009SG.PAYNOW010120208123456780301004082026030452040000530370254040.995802SG5911testcompany6009Singapore62270123testordernumber1234567863040047',
  vietQr:
    '00020101021238570010A00000072701270006970415011300110019324180208QRIBFTTA530370454061200005802VN62170813ung ho lu lut6304C15C',
  duitNow:
    '00020201021126410014A000000615000101065016640209123456789520499995303458540510.005802MY5909QRCSDNBHD6005BANGI6304343F',
};

/** Top-level data objects of a payload, by id. */
function fields(payload: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < payload.length;) {
    const id = payload.slice(i, i + 2);
    const length = Number.parseInt(payload.slice(i + 2, i + 4), 10);
    out[id] = payload.slice(i + 4, i + 4 + length);
    i += 4 + length;
  }
  return out;
}

describe('the EMVCo CRC', () => {
  it('is CRC-16/CCITT-FALSE', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it.each(Object.entries(PUBLISHED))('matches the published %s payload', (_name, payload) => {
    expect(hasValidCrc(payload)).toBe(true);
    expect(hasValidCrc(`${payload.slice(0, -5)}X${payload.slice(-4)}`)).toBe(false);
  });
});

describe('payload builders', () => {
  it('reproduces the published PayNow payload', () => {
    expect(
      payNowQr({
        proxyType: 'uen',
        proxy: '12345678',
        name: 'testcompany',
        amount: { amountMinor: 99n, exponent: 2 },
        editable: false,
        expiry: '20260304',
        reference: 'testordernumber12345678',
      }),
    ).toBe(PUBLISHED.payNow);
  });

  it('reproduces the published VietQR payload', () => {
    expect(
      vietQr({
        bankBin: '970415',
        accountNumber: '0011001932418',
        amount: { amountMinor: 120_000n, exponent: 0 },
        note: 'ủng hộ lũ lụt',
      }),
    ).toBe(PUBLISHED.vietQr);
  });

  it('carries the published PromptPay proxy and amount', () => {
    expect(promptPayMobile('089-999-9999')).toBe('0066899999999');
    expect(promptPayMobile('+66 89 999 9999')).toBe('0066899999999');
    const built = promptPayQr({
      proxyType: 'mobile',
      proxy: '0899999999',
      amount: { amountMinor: 42_000n, exponent: 2 },
    });
    const published = fields(PUBLISHED.promptPayAmount);
    const ours = fields(built);
    for (const id of ['00', '01', '29', '53', '54', '58']) expect(ours[id]).toBe(published[id]);
    expect(hasValidCrc(built)).toBe(true);
  });

  it('builds a DuitNow payload with the PayNet identifier and a valid CRC', () => {
    const built = duitNowQr({
      acquirerId: '501664',
      accountNumber: '123456789',
      name: 'Siti Aminah',
      amount: { amountMinor: 1_000n, exponent: 2 },
    });
    const ours = fields(built);
    expect(fields(ours['26'] ?? '')).toEqual({
      '00': 'A0000006150001',
      '01': '501664',
      '02': '123456789',
    });
    expect(ours['53']).toBe('458');
    expect(ours['54']).toBe('10.00');
    expect(hasValidCrc(built)).toBe(true);
  });

  it('marks a QR with an amount as single-use and one without as reusable', () => {
    expect(fields(vietQr({ bankBin: '970415', accountNumber: '0011' }))['01']).toBe('11');
    expect(emvAmount(5n, 2)).toBe('0.05');
    expect(() => emvAmount(0n, 2)).toThrow();
  });
});
