/**
 * Lab fixtures for the price lines of a driver card: what the reader answers for messages priced
 * by vehicle (with and without a crew size to pick with), per person, as a range and per hour.
 * Each is the reader's own output for the message beside it, from its recorded answers.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ParsedIntake } from '@cp/domain';

export interface PriceFixture {
  readonly text: string;
  readonly parsed: ParsedIntake;
}

export const PRICE_FIXTURES = {
  ask: {
    text: 'Sedan up to 3 pax 550k/day, Hiace up to 10 pax 950k/day. Driver Rai 0812 0000 3939',
    parsed: {
      card: {
        name: 'Rai',
        phone: '+6281200003939',
        area: null,
        languages: [],
        car: null,
        seats: null,
        price_minor: null,
        currency: null,
        price_unit: null,
        included_hours: null,
        includes: {},
        overtime_minor: null,
        licence_shown: null,
        price_tiers: [
          {
            label: 'Sedan up to 3 pax 550k/day',
            seats: 3,
            price_minor: 55000000,
            price_max_minor: null,
            currency: 'IDR',
            price_unit: 'day',
            price_per: null,
            included_hours: null,
          },
          {
            label: 'Hiace up to 10 pax 950k/day',
            seats: 10,
            price_minor: 95000000,
            price_max_minor: null,
            currency: 'IDR',
            price_unit: 'day',
            price_per: null,
            included_hours: null,
          },
        ],
        price_ask: 'Sedan up to 3 pax 550k/day / Hiace up to 10 pax 950k/day',
      },
      spans: {
        name: [57, 67],
        phone: [68, 82],
      },
      unreadable: [],
      cut_off: false,
    },
  },
  tiers: {
    text: 'Sedan up to 3 pax 550k/day, Hiace up to 10 pax 950k/day. Driver Rai 0812 0000 3939',
    parsed: {
      card: {
        name: 'Rai',
        phone: '+6281200003939',
        area: null,
        languages: [],
        car: 'Hiace',
        seats: 10,
        price_minor: 95000000,
        currency: 'IDR',
        price_unit: 'day',
        included_hours: null,
        includes: {},
        overtime_minor: null,
        licence_shown: null,
        price_tiers: [
          {
            label: 'Sedan up to 3 pax 550k/day',
            seats: 3,
            price_minor: 55000000,
            price_max_minor: null,
            currency: 'IDR',
            price_unit: 'day',
            price_per: null,
            included_hours: null,
          },
          {
            label: 'Hiace up to 10 pax 950k/day',
            seats: 10,
            price_minor: 95000000,
            price_max_minor: null,
            currency: 'IDR',
            price_unit: 'day',
            price_per: null,
            included_hours: null,
          },
        ],
      },
      spans: {
        name: [57, 67],
        phone: [68, 82],
        price: [28, 55],
      },
      unreadable: [],
      cut_off: false,
    },
  },
  person: {
    text: 'Nusa Penida west tour by car, Rp 450k per person, min 4 people, incl driver, fuel, parking. Entrance Kelingking 25k not incl. Ketut +62 812 0000 0606',
    parsed: {
      card: {
        name: 'Ketut',
        phone: '+6281200000606',
        area: 'Nusa Penida',
        languages: [],
        car: null,
        seats: null,
        price_minor: 45000000,
        currency: 'IDR',
        price_unit: 'trip',
        included_hours: null,
        includes: {
          fuel: 'yes',
          parking: 'yes',
          entry: 'no',
        },
        overtime_minor: null,
        licence_shown: null,
        price_per: 'person',
      },
      spans: {
        name: [126, 149],
        phone: [132, 149],
        price: [30, 48],
        includes: [64, 124],
      },
      unreadable: [],
      cut_off: false,
    },
  },
  range: {
    text: 'Depends on route, usually 600-800k per day. Gusti, 0812 0000 3030',
    parsed: {
      card: {
        name: 'Gusti',
        phone: '+6281200003030',
        area: null,
        languages: [],
        car: null,
        seats: null,
        price_minor: 60000000,
        currency: 'IDR',
        price_unit: 'day',
        included_hours: null,
        includes: {},
        overtime_minor: null,
        licence_shown: null,
        price_max_minor: 80000000,
      },
      spans: {
        name: [44, 49],
        phone: [51, 65],
        price: [18, 42],
      },
      unreadable: [],
      cut_off: false,
    },
  },
  hour: {
    text: 'Charter by hour ok, Rp 90k/hour min 4 hours, car Brio 4 seat. Include bensin. Name Dewa. 0813 0000 1111',
    parsed: {
      card: {
        name: 'Dewa',
        phone: '+6281300001111',
        area: null,
        languages: [],
        car: 'Brio',
        seats: 4,
        price_minor: 9000000,
        currency: 'IDR',
        price_unit: 'hours',
        included_hours: 4,
        includes: {
          fuel: 'yes',
        },
        overtime_minor: null,
        licence_shown: null,
        price_per: 'hour',
      },
      spans: {
        name: [78, 87],
        phone: [89, 103],
        car: [45, 60],
        price: [20, 43],
        includes: [62, 76],
      },
      unreadable: [],
      cut_off: false,
    },
  },
} as const satisfies Readonly<Record<string, PriceFixture>>;

export type PriceFixtureName = keyof typeof PRICE_FIXTURES;
