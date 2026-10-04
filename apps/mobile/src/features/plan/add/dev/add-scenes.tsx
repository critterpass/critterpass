/**
 * Lab scenes for Add to plan (7f-1) over the Bali week: Tokek's Saturday 08:00 for Tirta Empul
 * with its four reasons and Gunung Kawi to add too, a member's SUGGEST, who's going opened, a
 * place already in the plan, nowhere fitting and no signal, through the app's own copy.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { DayFit } from '@cp/domain';
import { tokens } from '@cp/design-tokens';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Scaffold } from '@/ui/surface/Scaffold';
import type { DayChip, FitGrade } from '@/ui/planning';

import { NO_TRIP_GUIDE } from '../../plan-guide';
import { AddBlock } from '../add-block';
import {
  addLabel,
  alreadyLine,
  blockDetail,
  dayHeader,
  leaveLine,
  lengthLabel,
  moveLabel,
  nearbyLine,
  nowhereNote,
  offlineNote,
  pickedLine,
  reasonTiles,
  whyTitle,
} from '../add-copy';
import { AddSheetView } from '../add-sheet-view';
import { WhoGoing } from '../who-going';

const noop = () => undefined;
const { color } = tokens;
const DAY_COLORS = [
  color.yellow,
  color.pink,
  color.blue,
  color.orange,
  color.green.base,
  color.paper.base,
];
const DATES = [
  '2026-10-12',
  '2026-10-13',
  '2026-10-14',
  '2026-10-15',
  '2026-10-16',
  '2026-10-17',
  '2026-10-18',
  '2026-10-19',
];
const GRADES: FitGrade[] = ['no', 'possible', 'no', 'possible', 'no', 'good', 'possible', 'no'];
export const CREW = ['Winston', 'Maya', 'Alex', 'Jordan', 'Rin', 'Dev'].map((name, index) => ({
  key: `00000000-0000-4000-8000-00000000a00${String(index)}`,
  name,
  joinIndex: index,
}));

export const SATURDAY: DayFit = {
  day_id: '00000000-0000-4000-8000-000000000106',
  day_no: 6,
  grade: 'good',
  slot: { starts_at: '2026-10-17T08:00:00+08:00', ends_at: '2026-10-17T09:30:00+08:00' },
  reasons: [
    { code: 'free_day', params: { day_no: 6 } },
    { code: 'opens_at', params: { time: '08:00' } },
    { code: 'quiet_until', params: { time: '10:00', source: 'editorial' } },
    { code: 'busy_from', params: { time: '10:00', level: 90, source: 'editorial' } },
    { code: 'drive_minutes', params: { minutes: 45, from: 'stay', approx: false } },
    { code: 'ride_works', params: { minutes: 45, approx: false } },
    { code: 'dry_mornings', params: { source: 'normals' } },
  ],
};

export function useLabDays(withFit: boolean): DayChip[] {
  const locale = useLocale();
  return DATES.map((date, index) => ({
    dayNo: index + 1,
    weekday: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
      new Date(`${date}T12:00:00Z`),
    ),
    color: DAY_COLORS[index % DAY_COLORS.length] ?? color.yellow,
    fit: withFit ? GRADES[index] : undefined,
    accessibilityLabel: date,
  }));
}

interface Variant {
  readonly organiser?: boolean;
  readonly whoOpen?: boolean;
  readonly already?: boolean;
  readonly note?: 'nowhere' | 'offline';
}

function AddScene({ organiser = true, whoOpen = false, already = false, note }: Variant) {
  const locale = useLocale();
  const days = useLabDays(note !== 'offline');
  const day = note === undefined ? SATURDAY : { ...SATURDAY, grade: 'no' as const, reasons: [] };
  const label = `${new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date('2026-10-17T12:00:00Z')).toUpperCase()} 17`;
  const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(
    new Date('2026-10-17T12:00:00Z'),
  );
  return (
    <Scaffold>
      <View style={{ flex: 1 }} />
      <AddSheetView
        name="TIRTA EMPUL"
        line={pickedLine('Tokek')}
        days={days}
        dayNo={6}
        onDay={noop}
        dayHeader={dayHeader(label, day)}
        block={
          <AddBlock
            leave={leaveLine(day, 480)}
            time="08:00"
            length={lengthLabel(90)}
            name="TIRTA EMPUL"
            detail={blockDetail(day)}
            editingTime={false}
            onTime={noop}
            start={480}
            end={570}
            onTimeChange={noop}
            nearby={
              note === undefined && !already
                ? {
                    time: '09:45',
                    text: nearbyLine('Gunung Kawi', 10),
                    picked: false,
                    onToggle: noop,
                  }
                : null
            }
          />
        }
        whyTitle={whyTitle('08:00')}
        reasons={reasonTiles(day, month)}
        note={
          already
            ? alreadyLine(label)
            : note === 'nowhere'
              ? nowhereNote()
              : note === 'offline'
                ? offlineNote(NO_TRIP_GUIDE.name)
                : null
        }
        who={
          <WhoGoing
            members={CREW}
            out={new Set(whoOpen ? [CREW[5]?.key ?? ''] : [])}
            open={whoOpen}
            onOpen={noop}
            onToggle={noop}
          />
        }
        cta={already ? moveLabel(label, '08:00') : addLabel(label, '08:00', organiser)}
        busy={false}
        disabled={false}
        onAdd={noop}
        onSaveLater={noop}
      />
    </Scaffold>
  );
}

const scene = (variant: Variant) =>
  function Scene() {
    return <AddScene {...variant} />;
  };

export const ADD_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'add-to-plan': scene({}),
  'add-to-plan-member': scene({ organiser: false }),
  'add-to-plan-who': scene({ whoOpen: true }),
  'add-to-plan-already': scene({ already: true }),
  'add-to-plan-nowhere': scene({ note: 'nowhere' }),
  'add-to-plan-offline': scene({ note: 'offline' }),
};
