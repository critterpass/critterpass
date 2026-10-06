import { describe, expect, it } from 'vitest';

import { parseAmount, parseReplyForm } from '../../src/components/driver-plan/reply-form';

const REF = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe('parseReplyForm', () => {
  it('reads a rupiah price however it was typed, with includes, overtime and the car', () => {
    const result = parseReplyForm(
      form([
        ['price', 'Rp 700.000'],
        ['include', 'petrol'],
        ['include', 'tolls'],
        ['include', 'champagne'],
        ['overtime', '75,000'],
        ['hours', '10'],
        ['car', 'Toyota Avanza, 6 seats'],
      ]),
    );
    expect(result).toEqual({
      ok: true,
      reply: {
        quote: {
          price_per_day_minor: 700_000,
          currency: 'IDR',
          includes: ['petrol', 'tolls'],
          overtime_per_hour_minor: 75_000,
          included_hours: 10,
          car: 'Toyota Avanza, 6 seats',
        },
        days: [],
        tips: [],
      },
    });
  });

  it('sends only the times the driver changed, with the day note', () => {
    const result = parseReplyForm(
      form([
        [`time:3:${REF}`, '07:00'],
        [`was:3:${REF}`, '07:30'],
        [`time:3:${OTHER}`, '11:30'],
        [`was:3:${OTHER}`, '11:30'],
        ['note:3', 'Tour buses arrive at 10.'],
      ]),
    );
    expect(result.ok && result.reply.days).toEqual([
      {
        day_no: 3,
        order: [],
        retime: [{ ref: REF, at: '07:00' }],
        note: 'Tour buses arrive at 10.',
      },
    ]);
    expect(result.ok && result.reply.quote).toBeNull();
  });

  it('refuses links in tips, an empty reply and more than five tips', () => {
    expect(parseReplyForm(form([['tip', 'Book at www.cheap-tours.com']]))).toEqual({
      ok: false,
      fields: ['tips'],
    });
    expect(parseReplyForm(form([['tip', '   ']])).ok).toBe(false);
    const six = Array.from({ length: 6 }, (_, i): [string, string] => ['tip', `Tip ${i}`]);
    expect(parseReplyForm(form(six))).toEqual({ ok: false, fields: ['tips'] });
  });

  it('parses blank amounts as missing', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount('1.400.000')).toBe(1_400_000);
  });
});
