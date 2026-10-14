import { describe, expect, it } from 'vitest';

import {
  textNumbers,
  validateDescribeReply,
  type DescribeReply,
  type DestinationFacts,
} from '../src/routes/destination-describe';

const facts: DestinationFacts = {
  name: 'Quy Nhơn',
  local_name: 'Quy Nhơn',
  kind: 'city',
  country: 'Vietnam',
  region: 'Bình Định Province',
  population: 210338,
  elevation_m: 10,
};

const reply = (enAbout: string, viAbout = 'Thành phố biển ở tỉnh Bình Định.'): DescribeReply => ({
  en: { line: 'Coastal city in Bình Định, central Vietnam', about: enAbout },
  vi: { line: 'Thành phố biển miền Trung', about: viAbout },
});

describe('validateDescribeReply', () => {
  it('accepts numbers the facts hold, however they are grouped', () => {
    const verdict = validateDescribeReply(
      reply('A city of 210,338 people on the coast.', 'Thành phố có 210.338 dân.'),
      facts,
    );
    expect(verdict.ok).toBe(true);
  });

  it('rejects a number or a year that is not in the facts', () => {
    expect(validateDescribeReply(reply('About 200,000 people live here.'), facts)).toEqual({
      ok: false,
      reason: 'en_number_not_in_facts',
    });
    expect(validateDescribeReply(reply('Founded in 1602 on the coast.'), facts)).toEqual({
      ok: false,
      reason: 'en_number_not_in_facts',
    });
    expect(validateDescribeReply(reply('A city.', 'Thành lập năm 1898.'), facts)).toEqual({
      ok: false,
      reason: 'vi_number_not_in_facts',
    });
  });

  it('rejects a line over 90 characters', () => {
    const long = { ...reply('A city.'), en: { line: 'x'.repeat(91), about: 'A city.' } };
    expect(validateDescribeReply(long, facts)).toEqual({ ok: false, reason: 'en_line_too_long' });
  });

  it('reads grouped digits as one number', () => {
    expect(textNumbers('210,338, 10 and 1 500 m')).toEqual(['210338', '10', '1500']);
  });
});
