/**
 * Day-of screen fixtures from the Batur morning (the window, before it, not up, overdue, all up,
 * on the way, not mine, a quiet day, offline) and the app's own alarm before and after its one
 * snooze. Built in the reader's language, so the locale is loaded first. Every handler is a no-op.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values. */
import { alarmText } from '../../alarm/alarm-copy';
import type { AlarmStatus } from '../../alarm/alarm-store';
import type { InAppAlarmProps } from '../../alarm/view-types';
import { dayEyebrow, forecastLabel } from '../day-of-copy';
import { alarmNoteFor } from '../day-of-data';
import type { DayOfProps } from '../use-day-of';
import {
  ALEX,
  AT_0248,
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
const LOCALE = 'en';

const NOTIFY: AlarmStatus = { mode: 'notification', engine: null, denied: false, next: null };
const NATIVE: AlarmStatus = { mode: 'native', engine: 'alarmkit', denied: false, next: null };

/** The day page's props with the day's eyebrow, forecast and alarm line. */
function day(
  overrides: Partial<DayOfProps> = {},
  status: AlarmStatus | null = null,
  date = { date: '2026-10-15', no: 4 },
): DayOfProps {
  const base: DayOfProps = {
    state: 'ready',
    eyebrow: dayEyebrow(date.date, date.no, LOCALE, false),
    forecast: forecastLabel(9, true, LOCALE),
    leaveBy: baturLeaveBy(),
    now: AT_0248,
    guideName: 'Tokek',
    firstUp: null,
    pack: BALI_PACK,
    timeline: BALI_TIMELINE,
    offline: false,
    alarmNote: null,
    late: null,
    onImUp: noop,
    onTogglePack: noop,
    onAddPack: noop,
    onRemovePack: noop,
    ...overrides,
  };
  const note = status === null ? null : alarmNoteFor(base.leaveBy, status, null, LOCALE);
  return {
    ...base,
    alarmNote:
      note === null
        ? null
        : {
            text: note.text,
            ...(note.actionLabel === null
              ? {}
              : { action: { label: note.actionLabel, onPress: noop } }),
          },
  };
}

const BEFORE = new Date('2026-10-14T17:05:00Z');
const LATE = new Date('2026-10-14T19:13:00Z');
const GONE = new Date('2026-10-14T19:16:00Z');
const QUIET = {
  forecast: '31°',
  leaveBy: null,
  firstUp: { kind: 'first', id: 'lab-first', time: '09:30', title: 'Toya Devasya hot springs' },
  pack: [],
  timeline: BALI_TIMELINE.slice(1),
} as const satisfies Partial<DayOfProps>;

export const DAY_OF_FIXTURES: Readonly<Record<string, () => DayOfProps>> = {
  '3k-2-window': () => day(),
  '3k-2-before': () =>
    day({ now: BEFORE, leaveBy: baturLeaveBy({ now: BEFORE, up: [MAYA] }) }, NATIVE),
  '3k-2-not-up': () => day({ leaveBy: baturLeaveBy({ up: [MAYA, JORDAN, RIN] }) }, NOTIFY),
  '3k-2-overdue': () => day({ now: LATE, leaveBy: baturLeaveBy({ now: LATE, knocked: true }) }),
  '3k-2-all-up': () => day({ leaveBy: baturLeaveBy({ up: ALL }) }),
  '3k-2-transit': () =>
    day({ now: GONE, leaveBy: baturLeaveBy({ now: GONE, up: ALL, state: 'departed' }) }),
  '3k-2-not-mine': () =>
    day({ leaveBy: baturLeaveBy({ participants: [MAYA, JORDAN, RIN, ALEX, DEV] }) }),
  '3k-2-quiet-day': () => day(QUIET, null, { date: '2026-10-16', no: 5 }),
  '3k-2-offline': () =>
    day({
      offline: true,
      pack: BALI_PACK.map((chip) => (chip.id === 'p3' ? { ...chip, packed: true } : chip)),
    }),
};

/** The app's own alarm for the Batur leave-by, with its snooze or after it. */
export function alarmFixture(snoozeAllowed: boolean): InAppAlarmProps {
  const text = alarmText(
    { ...baturLeaveBy(), guideNote: "The sun won't wait. Neither will Made. Up!" },
    'Tokek',
    LOCALE,
  );
  return {
    guide: 'tokek',
    eyebrow: text.eyebrow,
    time: text.time,
    subtitle: text.subtitle,
    guideLine: text.guideLine,
    snoozeAllowed,
    onUp: noop,
    onSnooze: noop,
    ...(snoozeAllowed ? {} : { onClose: noop }),
  };
}
