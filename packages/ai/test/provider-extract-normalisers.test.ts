import { describe, expect, it } from 'vitest';

import {
  amountTokens,
  currencyIn,
  minutesIn,
  parseFigure,
  writtenAmount,
} from '../src/routes/provider-extract/money-text';
import { numbersIn, verifiedPhone } from '../src/routes/provider-extract/phone';
import { spanOf } from '../src/routes/provider-extract/span';
import { capacityIn, seatsIn, vehicleOf } from '../src/routes/provider-extract/vehicle';

const known = (code: string) => ['IDR', 'USD', 'EUR', 'MXN', 'VND', 'PEN', 'ISK'].includes(code);

describe('figures a driver wrote', () => {
  it('reads thousands and decimals by how the separators are grouped', () => {
    expect(parseFigure('650')).toBe(650);
    expect(parseFigure('650.000')).toBe(650_000);
    expect(parseFigure('1,150')).toBe(1150);
    expect(parseFigure('3.500.000')).toBe(3_500_000);
    expect(parseFigure('1.250,50')).toBe(1250.5);
    expect(parseFigure('1,2')).toBe(1.2);
    expect(parseFigure('2.5')).toBe(2.5);
    expect(parseFigure('12.3456')).toBeNull();
    expect(parseFigure('1.2.3')).toBeNull();
  });

  it('applies local thousand and million shorthand', () => {
    const only = (text: string) => amountTokens(text).map((token) => token.min);
    expect(only('700k')).toEqual([700_000]);
    expect(only('650rb/hari')).toEqual([650_000]);
    expect(only('1,2tr')).toEqual([1_200_000]);
    expect(only('2 juta')).toEqual([2_000_000]);
    expect(only('Rp 700.000')).toEqual([700_000]);
    expect(only('3万円')).toEqual([30_000]);
    expect(only('2 mil pesos')).toEqual([2000]);
    // A unit that only starts like a suffix is not one.
    expect(only('12 km, 10 trips')).toEqual([12, 10]);
  });

  it('marks a figure written as money and leaves hours and seats unmarked', () => {
    const tokens = amountTokens('Full day 10 hrs Rp 650k, 6 pax, 480 EUR or $55');
    expect(tokens.map((token) => [token.min, token.marked])).toEqual([
      [10, false],
      [650_000, true],
      [6, false],
      [480, true],
      [55, true],
    ]);
    expect(amountTokens('22.000 ISK')[0]?.marked).toBe(true);
    expect(amountTokens('3.500.000đ/người')[0]?.marked).toBe(true);
  });

  it('keeps a range as its two ends, the low end in the same thousands as the high end', () => {
    expect(amountTokens('usually 600-800k per day')).toEqual([
      { min: 600_000, max: 800_000, marked: true },
    ]);
    expect(amountTokens('Rp 600.000 – Rp 700.000')).toEqual([
      { min: 600_000, max: 700_000, marked: true },
    ]);
    expect(amountTokens('1,2tr đến 1,5tr')).toEqual([
      { min: 1_200_000, max: 1_500_000, marked: true },
    ]);
    // Two figures that do not rise are two figures, not a range.
    expect(amountTokens('800 - 600').map((token) => token.max)).toEqual([null, null]);
  });
});

describe('the amount the model answered against the words', () => {
  const source = 'Depends on route, usually 600-800k per day. Deposit 100k.';

  it('answers the figure when it is written in the quote', () => {
    expect(writtenAmount(650_000, null, 'Full day 10 hrs Rp 650k', '')).toEqual({
      min: 650_000,
      max: null,
    });
  });

  it('answers the whole range for any figure inside a written range', () => {
    const range = { min: 600_000, max: 800_000 };
    expect(writtenAmount(600_000, 800_000, '600-800k per day', source)).toEqual(range);
    expect(writtenAmount(700_000, null, '600-800k per day', source)).toEqual(range);
    expect(writtenAmount(800_000, null, '600-800k per day', source)).toEqual(range);
  });

  it('accepts two ends the model split out of "from … up to …" only when both are written', () => {
    expect(writtenAmount(500, 700, 'from 500 EUR, up to 700 EUR in August', '')).toEqual({
      min: 500,
      max: 700,
    });
    expect(writtenAmount(500, 900, 'from 500 EUR, up to 700 EUR in August', '')).toBeNull();
  });

  it('takes the one money figure in the quote when the model is off by thousands', () => {
    expect(writtenAmount(185, null, 'ISK 185.000 for the group, 8 hours', '')).toEqual({
      min: 185_000,
      max: null,
    });
    // Off by anything else is not a slip of scale.
    expect(writtenAmount(370_000, null, 'ISK 185.000 for the group', '')).toBeNull();
  });

  it('refuses a figure the driver never wrote: a sum, a product or an average', () => {
    expect(writtenAmount(650_000, null, 'Car 500k per day, driver fee 150k', source)).toBeNull();
    expect(writtenAmount(360_000, null, 'Rp 90k/hour min 4 hours', source)).toBeNull();
    expect(writtenAmount(0, null, 'free', source)).toBeNull();
    expect(writtenAmount(Number.NaN, null, '650k', source)).toBeNull();
  });

  it('finds a money figure elsewhere in the message when the quote leaves it out', () => {
    expect(writtenAmount(100_000, null, 'Deposit', source)).toEqual({ min: 100_000, max: null });
    // An unmarked number elsewhere (hours, seats) is not a price.
    expect(writtenAmount(10, null, 'Full day', 'Full day 10 hours, price later')).toBeNull();
  });
});

describe('currency and overtime units in the words', () => {
  it('reads a code next to a figure or a sign only one currency uses', () => {
    expect(currencyIn('$2,800 MXN por camioneta', known)).toBe('MXN');
    expect(currencyIn('USD 55 per car', known)).toBe('USD');
    expect(currencyIn('Rp 650.000', known)).toBe('IDR');
    expect(currencyIn('700rb/hari', known)).toBe('IDR');
    expect(currencyIn('320€ por viatura', known)).toBe('EUR');
    expect(currencyIn('3.500.000đ/người', known)).toBe('VND');
    expect(currencyIn('S/ 350 por auto', known)).toBe('PEN');
  });

  it('leaves a shared sign, a bare figure and an unknown code undecided', () => {
    expect(currencyIn('$450 la hora', known)).toBeNull();
    expect(currencyIn('¥27,000', known)).toBeNull();
    expect(currencyIn('650k', known)).toBeNull();
    expect(currencyIn('500 XYZ', known)).toBeNull();
    expect(currencyIn('£40', known)).toBeNull();
  });

  it('reads the minutes an overtime price buys', () => {
    expect(minutesIn('延長30分 ¥4,500')).toBe(30);
    expect(minutesIn('extra 50k per 30 min')).toBe(30);
    expect(minutesIn('15 menit 25rb')).toBe(15);
    expect(minutesIn('Overtime 75k/hour')).toBeNull();
    expect(minutesIn('900 minutes')).toBeNull();
  });
});

describe('phone numbers', () => {
  it('gives a local number the calling code of the trip country', () => {
    expect(verifiedPhone('0813-0000-0202', 'WhatsApp 0813-0000-0202', '62')).toBe('+6281300000202');
    expect(verifiedPhone('912 000 024', '912 000 024', '351')).toBe('+351912000024');
    expect(verifiedPhone('55-0000-2222', 'Don Beto 55-0000-2222', '52')).toBe('+525500002222');
    expect(verifiedPhone('080-0000-1616', '田中 080-0000-1616', '81')).toBe('+818000001616');
  });

  it('keeps a country code the message shows, whatever the trip country', () => {
    expect(verifiedPhone('+62 812 0000 0101', 'WA +62 812 0000 0101', '81')).toBe('+6281200000101');
    expect(verifiedPhone('+354 800 0018', 'Phone +354 800 0018', null)).toBe('+3548000018');
  });

  it('never invents a country code when the country is unknown', () => {
    expect(verifiedPhone('0813-0000-0202', 'WhatsApp 0813-0000-0202', null)).toBeNull();
    // The model adding one of its own does not make it written.
    expect(verifiedPhone('+6281300000202', 'WhatsApp 0813-0000-0202', null)).toBeNull();
  });

  it('drops the legacy mobile 1 after +52', () => {
    expect(verifiedPhone('+52 1 55 0000 2121', 'WhatsApp is +52 1 55 0000 2121', '52')).toBe(
      '+525500002121',
    );
  });

  it('reads the full number from a chat link', () => {
    expect(verifiedPhone('6281300000808', 'wa.me/6281300000808', null)).toBe('+6281300000808');
    expect(verifiedPhone('+6281300000808', 'wa.me/6281300000808', '62')).toBe('+6281300000808');
  });

  it('answers the number the model pointed at when the quote holds two', () => {
    const quote = 'office +351 21 000 0032, mobile/WhatsApp +351 915 000 033';
    expect(numbersIn(quote, '351').map((number) => number.number)).toEqual([
      '+351210000032',
      '+351915000033',
    ]);
    expect(verifiedPhone('+351 915 000 033', quote, '351')).toBe('+351915000033');
  });

  it('refuses digits the quote does not hold, and a number too short to dial', () => {
    expect(verifiedPhone('+6281299999999', '+62 812 0000 0101', '62')).toBeNull();
    expect(verifiedPhone('12345', 'room 12345', '62')).toBeNull();
  });
});

describe('quoted words and the car line', () => {
  it('matches quotes across case and spacing differences', () => {
    expect(spanOf('Rp  650K\nper day', 'rp 650k per day')).toEqual([0, 16]);
    expect(spanOf('abc', '')).toBeNull();
    expect(spanOf('abc', 'abd')).toBeNull();
  });

  it('finds a quote the model shortened with an ellipsis, pieces in order', () => {
    const source = "Book Sofia's tuk-tuk in Sintra, 2h tour €90 for up to 6";
    const [start, end] = spanOf(source, 'tuk-tuk ... up to 6') ?? [0, 0];
    expect(source.slice(start, end)).toBe('tuk-tuk in Sintra, 2h tour €90 for up to 6');
    expect(spanOf(source, 'up to 6 … tuk-tuk')).toBeNull();
    expect(spanOf(source, '...')).toBeNull();
  });

  it('keeps a vehicle model or kind and drops a bare "car"', () => {
    expect(vehicleOf(' Avanza ')).toBe('Avanza');
    expect(vehicleOf('jumbo taxi')).toBe('jumbo taxi');
    expect(vehicleOf('car')).toBeNull();
    expect(vehicleOf('Private car charter')).toBeNull();
    expect(vehicleOf(null)).toBeNull();
  });

  it('keeps seats only when the quoted words hold the figure', () => {
    expect(seatsIn(6, 'Avanza 6 pax')).toBe(6);
    expect(seatsIn(15, '6-15 seats')).toBe(15);
    expect(seatsIn(6, 'her husband drives a Suburban')).toBeNull();
    expect(seatsIn(1, 'xe máy chở khách')).toBe(1);
    expect(seatsIn(0, '0 seats')).toBeNull();
    expect(seatsIn(80, '80 seats')).toBeNull();
    expect(seatsIn(null, '6 pax')).toBeNull();
  });

  it('reads what a vehicle carries, not how many travelled', () => {
    expect(capacityIn('fixed 22.000 ISK to Reykjavík for up to 4')).toBe(4);
    expect(capacityIn('van 10 pax S/ 450')).toBe(10);
    expect(capacityIn('ジャンボタクシー9人乗り')).toBe(9);
    expect(capacityIn('hasta 7 personas')).toBe(7);
    expect(capacityIn('$180 USD for a full day for 6 of us')).toBeNull();
  });
});
