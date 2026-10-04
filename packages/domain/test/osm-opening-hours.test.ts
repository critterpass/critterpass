import { describe, expect, it } from 'vitest';

import type { TimeSpan, WeeklySpans } from '../src/places/hours';
import { parseOsmOpeningHours } from '../src/places/osm-opening-hours';

const span = (start: string, end: string): TimeSpan => ({ start, end });
const ALL_DAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const;

function every(spans: TimeSpan[]): WeeklySpans {
  return Object.fromEntries(ALL_DAYS.map((day) => [day, spans]));
}

// Values copied from OSM objects in the guide destinations (Bali, Kyoto, Lisbon, Hội An, Cusco).
const READABLE: ReadonlyArray<readonly [string, WeeklySpans]> = [
  ['24/7', every([span('00:00', '24:00')])],
  ['Mo-Su 08:00-17:00', every([span('08:00', '17:00')])],
  ['08:00-17:00', every([span('08:00', '17:00')])],
  ['Mo-Su 8:00-17:00', every([span('08:00', '17:00')])],
  ['Mo-Su 08:00–17:00', every([span('08:00', '17:00')])],
  ['Mo - Su 08:00 - 17:00', every([span('08:00', '17:00')])],
  ['mo-su 08:00-17:00 open', every([span('08:00', '17:00')])],
  [
    'Mo-Fr 09:00-18:00; Sa 10:00-14:00; Su off',
    {
      mo: [span('09:00', '18:00')],
      tu: [span('09:00', '18:00')],
      we: [span('09:00', '18:00')],
      th: [span('09:00', '18:00')],
      fr: [span('09:00', '18:00')],
      sa: [span('10:00', '14:00')],
      su: [],
    },
  ],
  [
    'Tu-Su 09:00-17:00; Mo off; PH off',
    {
      mo: [],
      tu: [span('09:00', '17:00')],
      we: [span('09:00', '17:00')],
      th: [span('09:00', '17:00')],
      fr: [span('09:00', '17:00')],
      sa: [span('09:00', '17:00')],
      su: [span('09:00', '17:00')],
    },
  ],
  [
    'Mo-Fr 08:30-12:00,13:30-17:30; Sa 08:30-12:00; Su,PH closed',
    {
      mo: [span('08:30', '12:00'), span('13:30', '17:30')],
      tu: [span('08:30', '12:00'), span('13:30', '17:30')],
      we: [span('08:30', '12:00'), span('13:30', '17:30')],
      th: [span('08:30', '12:00'), span('13:30', '17:30')],
      fr: [span('08:30', '12:00'), span('13:30', '17:30')],
      sa: [span('08:30', '12:00')],
      su: [],
    },
  ],
  [
    'Mo-Fr 08:00-12:00, 13:00-17:00',
    {
      mo: [span('08:00', '12:00'), span('13:00', '17:00')],
      tu: [span('08:00', '12:00'), span('13:00', '17:00')],
      we: [span('08:00', '12:00'), span('13:00', '17:00')],
      th: [span('08:00', '12:00'), span('13:00', '17:00')],
      fr: [span('08:00', '12:00'), span('13:00', '17:00')],
    },
  ],
  [
    'Mo-Fr 08:00-12:00 13:00-17:00',
    {
      mo: [span('08:00', '12:00'), span('13:00', '17:00')],
      tu: [span('08:00', '12:00'), span('13:00', '17:00')],
      we: [span('08:00', '12:00'), span('13:00', '17:00')],
      th: [span('08:00', '12:00'), span('13:00', '17:00')],
      fr: [span('08:00', '12:00'), span('13:00', '17:00')],
    },
  ],
  [
    'Mo,We,Fr 10:00-16:00',
    {
      mo: [span('10:00', '16:00')],
      we: [span('10:00', '16:00')],
      fr: [span('10:00', '16:00')],
    },
  ],
  [
    'Mo-Fr 09:00-17:00, Sa 10:00-13:00',
    {
      mo: [span('09:00', '17:00')],
      tu: [span('09:00', '17:00')],
      we: [span('09:00', '17:00')],
      th: [span('09:00', '17:00')],
      fr: [span('09:00', '17:00')],
      sa: [span('10:00', '13:00')],
    },
  ],
  ['Fr-Sa 18:00-02:00', { fr: [span('18:00', '02:00')], sa: [span('18:00', '02:00')] }],
  ['Mo-Su 17:00-26:00', every([span('17:00', '02:00')])],
  ['Mo-Su 10:00-24:00', every([span('10:00', '24:00')])],
  [
    'Sa-Mo 10:00-15:00',
    { sa: [span('10:00', '15:00')], su: [span('10:00', '15:00')], mo: [span('10:00', '15:00')] },
  ],
  [
    'Mo-Su 06:00-22:00; We 06:00-12:00',
    { ...every([span('06:00', '22:00')]), we: [span('06:00', '12:00')] },
  ],
  [
    'Mo-Fr 07:00-19:00 || Sa 08:00-12:00',
    {
      mo: [span('07:00', '19:00')],
      tu: [span('07:00', '19:00')],
      we: [span('07:00', '19:00')],
      th: [span('07:00', '19:00')],
      fr: [span('07:00', '19:00')],
      sa: [span('08:00', '12:00')],
    },
  ],
  ['24/7; PH off', every([span('00:00', '24:00')])],
  ['Mon-Sat 09:00-22:00; Sun off', { ...every([span('09:00', '22:00')]), su: [] }],
  ['Mo-Sun 12:00-21:00', every([span('12:00', '21:00')])],
  ['00:00-00:00', every([span('00:00', '24:00')])],
  ['Mo-Su12:00-23:00', every([span('12:00', '23:00')])],
  ['Mo-Su 07:00-00:00', every([span('07:00', '24:00')])],
  [
    'Mo 15:00-00:00, Tu-Su 10:00-00:00',
    { ...every([span('10:00', '24:00')]), mo: [span('15:00', '24:00')] },
  ],
  [
    'Mo-Sa 00:00-01:00,12:00-24:00; Su 00:00-01:00,14:00-24:00',
    {
      ...every([span('00:00', '01:00'), span('12:00', '24:00')]),
      su: [span('00:00', '01:00'), span('14:00', '24:00')],
    },
  ],
];

const UNKNOWN: readonly string[] = [
  '',
  '   ',
  'off',
  'closed',
  'unknown',
  'sunrise-sunset',
  'Mo-Su 06:00-sunset',
  'Mo-Su 18:00+',
  'Apr-Oct Mo-Su 09:00-18:00; Nov-Mar Mo-Su 10:00-16:00',
  'Jan 01 off',
  'week 01-26 Mo-Fr 08:00-12:00',
  'Mo[1] 09:00-12:00',
  'Mo-Fr 09:00-17:00 "by appointment"',
  'by appointment',
  'daily 8am-5pm',
  '9am - 5pm',
  'Mo-Fr 25:00-26:00',
  'Mo-Fr 09:00-09:00',
  'Mo-Fr',
  'Mo-Su 10:00-10:00',
  'Mo-Su,PH 08:00+',
  'Mo-Sa 09:30-14:30, 18:30-21-00;Su off;',
];

describe('parseOsmOpeningHours', () => {
  it.each(READABLE)('reads %j as a weekly schedule', (source, weekly) => {
    expect(parseOsmOpeningHours(source)).toEqual({ weekly });
  });

  it.each(UNKNOWN)('reads %j as unknown hours', (source) => {
    expect(parseOsmOpeningHours(source)).toBeNull();
  });

  it('treats a missing value as unknown', () => {
    expect(parseOsmOpeningHours(null)).toBeNull();
    expect(parseOsmOpeningHours(undefined)).toBeNull();
  });
});
