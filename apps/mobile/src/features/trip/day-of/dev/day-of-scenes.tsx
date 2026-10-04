/**
 * Lab scenes for the day-of screen (3k-2), the app's own leave-by alarm (5b-3) and the alarm
 * permission sheets, over the Batur morning, with every handler a no-op.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { useState, type ReactNode } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

import { alarmText } from '../../alarm/alarm-copy';
import { AlarmPermissionSheet, type AlarmSheetKind } from '../../alarm/alarm-permission-sheet';
import { InAppAlarm } from '../../alarm/in-app-alarm';
import type { AlarmStatus } from '../../alarm/alarm-store';
import { alarmNoteFor } from '../day-of-data';
import { dayEyebrow, forecastLabel } from '../day-of-copy';
import { DayOfView, type DayOfViewProps } from '../day-of-view';
import {
  airportLeaveBy,
  ALEX,
  AT_0248,
  AT_0440,
  BALI_PACK,
  BALI_TIMELINE,
  baturLeaveBy,
  DEV,
  JORDAN,
  MAYA,
  RIN,
  WINSTON,
} from './bali-day';

const noop = () => undefined;
const ALL = [WINSTON, MAYA, JORDAN, RIN, ALEX, DEV];

function props(overrides: Partial<DayOfViewProps> = {}): DayOfViewProps {
  const merged: DayOfViewProps = {
    state: 'ready',
    eyebrow: '',
    forecast: null,
    leaveBy: baturLeaveBy(),
    now: AT_0248,
    guideName: 'Tokek',
    firstUp: null,
    pack: BALI_PACK,
    timeline: BALI_TIMELINE,
    offline: false,
    alarmNote: null,
    onImUp: noop,
    onTogglePack: noop,
    onAddPack: noop,
    onRemovePack: noop,
    ...overrides,
  };
  // GO shows where the screen has a next stop to go to, as `dayOfGo` decides on the real screen.
  const hasStop =
    merged.leaveBy !== null || (merged.firstUp !== null && merged.firstUp.kind !== 'done');
  return { ...merged, onGo: hasStop ? noop : undefined };
}

/** Day 1 of a Đà Nẵng trip: the flight in, then the afternoon. */
const DA_NANG_FIRST_DAY: DayOfViewProps['timeline'] = [
  { id: 'flight-in', time: '07:05', title: '9G 956 SGN → DAD', detail: null, dimmed: false },
  { id: 'han-market', time: '14:00', title: 'Chợ Hàn (Han Market)', detail: null, dimmed: false },
  {
    id: 'dragon-bridge',
    time: '18:00',
    title: 'Cầu Rồng (Dragon Bridge)',
    detail: null,
    dimmed: false,
  },
];

const NOTIFY: AlarmStatus = { mode: 'notification', engine: null, denied: false, next: null };
const NATIVE: AlarmStatus = { mode: 'native', engine: 'alarmkit', denied: false, next: null };

/** The day-of view with the day's eyebrow, forecast and alarm line in the lab's language. */
function Day({
  overrides = {},
  status = null,
  day = { date: '2026-10-15', no: 4 },
  tomorrow = false,
}: {
  readonly overrides?: Partial<DayOfViewProps>;
  readonly status?: AlarmStatus | null;
  readonly day?: { readonly date: string; readonly no: number };
  readonly tomorrow?: boolean;
}) {
  const locale = useLocale();
  const base = props(overrides);
  const note = status === null ? null : alarmNoteFor(base.leaveBy, status, null, locale);
  return (
    <DayOfView
      {...base}
      eyebrow={dayEyebrow(day.date, day.no, locale, tomorrow)}
      forecast={base.forecast ?? forecastLabel(9, true, locale)}
      alarmNote={
        note === null
          ? null
          : {
              text: note.text,
              ...(note.actionLabel === null
                ? {}
                : { action: { label: note.actionLabel, onPress: noop } }),
            }
      }
    />
  );
}

function Alarm({ snoozeAllowed }: { readonly snoozeAllowed: boolean }) {
  const locale = useLocale();
  const view = baturLeaveBy();
  const text = alarmText(
    { ...view, guideNote: "The sun won't wait. Neither will Made. Up!" },
    'Tokek',
    locale,
  );
  return (
    <InAppAlarm
      guide="tokek"
      eyebrow={text.eyebrow}
      time={text.time}
      subtitle={text.subtitle}
      guideLine={text.guideLine}
      snoozeAllowed={snoozeAllowed}
      onUp={noop}
      onSnooze={noop}
      {...(snoozeAllowed ? {} : { onClose: noop })}
    />
  );
}

/** The sheet closes for real (back, the grabber), so a second back leaves the scene. */
function SheetScene({ kind }: { readonly kind: AlarmSheetKind }) {
  const [open, setOpen] = useState(true);
  return (
    <Day
      overrides={{
        leaveBy: baturLeaveBy({ up: [MAYA, JORDAN, RIN] }),
        overlay: open ? (
          <AlarmPermissionSheet
            kind={kind}
            guideName="Tokek"
            onPrimary={noop}
            onClose={() => setOpen(false)}
          />
        ) : null,
      }}
    />
  );
}

function sheet(kind: AlarmSheetKind): ReactNode {
  return <SheetScene kind={kind} />;
}

const BEFORE = new Date('2026-10-14T17:05:00Z');
const LATE = new Date('2026-10-14T19:13:00Z');
const GONE = new Date('2026-10-14T19:16:00Z');

export const DAY_OF_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '3k-2-window': () => <Day />,
  '3k-2-before': () => (
    <Day
      overrides={{ now: BEFORE, leaveBy: baturLeaveBy({ now: BEFORE, up: [MAYA] }) }}
      status={NATIVE}
    />
  ),
  '3k-2-not-up': () => (
    <Day overrides={{ leaveBy: baturLeaveBy({ up: [MAYA, JORDAN, RIN] }) }} status={NOTIFY} />
  ),
  '3k-2-overdue': () => (
    <Day overrides={{ now: LATE, leaveBy: baturLeaveBy({ now: LATE, knocked: true }) }} />
  ),
  '3k-2-all-up': () => <Day overrides={{ leaveBy: baturLeaveBy({ up: ALL }) }} />,
  '3k-2-transit': () => (
    <Day
      overrides={{
        now: GONE,
        leaveBy: baturLeaveBy({ now: GONE, up: ALL, state: 'departed' }),
      }}
    />
  ),
  '3k-2-not-mine': () => (
    <Day overrides={{ leaveBy: baturLeaveBy({ participants: [MAYA, JORDAN, RIN, ALEX, DEV] }) }} />
  ),
  '3k-2-be-at-airport': () => (
    <Day
      day={{ date: '2026-10-02', no: 1 }}
      overrides={{
        now: AT_0440,
        leaveBy: airportLeaveBy(),
        forecast: '26°',
        pack: [],
        timeline: DA_NANG_FIRST_DAY,
      }}
      status={NATIVE}
    />
  ),
  '3k-2-day-done': () => (
    <Day
      day={{ date: '2026-10-16', no: 5 }}
      overrides={{ forecast: '31°', leaveBy: null, firstUp: { kind: 'done' }, pack: [] }}
    />
  ),
  '3k-2-tomorrow': () => (
    <Day
      day={{ date: '2026-10-16', no: 5 }}
      tomorrow
      overrides={{
        forecast: '31°',
        leaveBy: null,
        firstUp: { kind: 'first', time: '09:30', title: 'Toya Devasya hot springs' },
        pack: [],
        timeline: BALI_TIMELINE.slice(1),
        onToday: noop,
      }}
    />
  ),
  '3k-2-quiet-day': () => (
    <Day
      day={{ date: '2026-10-16', no: 5 }}
      overrides={{
        forecast: '31°',
        leaveBy: null,
        firstUp: { kind: 'first', time: '09:30', title: 'Toya Devasya hot springs' },
        pack: [],
        timeline: BALI_TIMELINE.slice(1),
      }}
    />
  ),
  '3k-2-offline': () => (
    <Day
      overrides={{
        offline: true,
        pack: BALI_PACK.map((chip) => (chip.id === 'p3' ? { ...chip, packed: true } : chip)),
      }}
    />
  ),
  '3k-2-loading': () => <Day overrides={{ state: 'loading' }} />,
  '5b-3-ringing': () => <Alarm snoozeAllowed />,
  '5b-3-crew-pinged': () => <Alarm snoozeAllowed={false} />,
  'alarm-sheet-ask': () => sheet('ask'),
  'alarm-sheet-exact': () => sheet('exact'),
  'alarm-sheet-denied': () => sheet('denied'),
  'alarm-sheet-notification': () => sheet('notification'),
};
