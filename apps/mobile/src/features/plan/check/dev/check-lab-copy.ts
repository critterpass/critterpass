/**
 * The plan check lab's Bali fixtures, worded through the screens' own copy: the issues of the
 * check render (a clash on Tuesday, a long Sunday, the wet ridge walk, a packed day and a held
 * table), Tuesday's stops for less driving, Wednesday's chart, the crew for balance.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { tokens } from '@cp/design-tokens';
import type { PlanCheckIssue } from '@cp/domain';
import { t } from '@lingui/core/macro';

import { checkedAgo, dayTag, weekdayName } from '../format';
import type { IssueCardProps } from '../issue-card';
import { fixKindLabel, fixSummary, openByHandLabel } from '../fix-copy';
import { issueWords, kindTag, knowLine, type IssueContext } from '../issue-copy';
import { nearerDetail, nearerUseLabel } from '../check-copy';
import { driveLine } from '../format';
import type { SwapChartProps } from '../rain-crowds/swap-chart';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TRIP = id(1);
const VERSION = id(2);
const DAYS: Readonly<Record<string, string>> = {
  [id(11)]: '2026-10-13',
  [id(12)]: '2026-10-14',
  [id(16)]: '2026-10-18',
};
const NAMES: Readonly<Record<string, string>> = {
  [id(21)]: 'Cooking class',
  [id(22)]: 'Monkey Forest',
  [id(23)]: 'Ridge walk',
  [id(24)]: 'Karsa Spa',
  [id(25)]: 'Dinner',
};
const TIMES: Readonly<Record<string, [string, string]>> = {
  [id(21)]: ['09:00', '13:00'],
  [id(22)]: ['12:00', '13:00'],
};

export const VILLA = { lat: -8.5069, lng: 115.2625 };

function context(locale: string): IssueContext {
  return {
    name: (stableId) => NAMES[stableId] ?? '',
    startOf: (stableId) => TIMES[stableId]?.[0] ?? null,
    endOf: (stableId) => TIMES[stableId]?.[1] ?? null,
    dayDate: (dayId) => (dayId === null ? null : (DAYS[dayId] ?? null)),
    bookingTitle: () => 'Locavore NXT',
    month: () => october(locale),
    shortDate: (instant) =>
      new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        timeZone: 'Asia/Makassar',
      }).format(new Date(instant)),
    weekday: weekdayName,
    clock: (instant) => instant.slice(11, 16),
  };
}

const base = { trip_id: TRIP, version_id: VERSION, fingerprint: 'lab' };

const ISSUES: PlanCheckIssue[] = [
  {
    ...base,
    id: id(31),
    kind: 'clash',
    severity: 'fix',
    day_id: id(11),
    stable_ids: [id(21), id(22)],
    params: { first: id(21), second: id(22), short_minutes: 60 },
    fix: { kind: 'screen', screen: 'less_driving' },
    rank: 0,
  },
  {
    ...base,
    id: id(32),
    kind: 'too_far',
    severity: 'fix',
    day_id: id(16),
    stable_ids: [id(25)],
    params: { drive_minutes: 240, limit_minutes: 180, longest_leg_minutes: 120, after_dark: true },
    fix: { kind: 'screen', screen: 'too_far' },
    rank: 1,
  },
  {
    ...base,
    id: id(33),
    kind: 'rain',
    severity: 'fix',
    day_id: id(12),
    stable_ids: [id(23)],
    params: { stable_id: id(23), from: '13:00', to: '15:00', pct: 55, source: 'normals' },
    fix: { kind: 'screen', screen: 'rain_crowds' },
    rank: 2,
  },
];

const KNOW: PlanCheckIssue[] = [
  {
    ...base,
    id: id(34),
    kind: 'pace',
    severity: 'know',
    day_id: id(11),
    stable_ids: [],
    params: { stops: 6, limit: 6 },
    fix: { kind: 'none' },
    rank: 3,
  },
  {
    ...base,
    id: id(35),
    kind: 'booking_note',
    severity: 'know',
    day_id: null,
    stable_ids: [],
    params: { booking_id: id(41), deadline: '2026-10-01T12:00:00+08:00', kind: 'hold_expiry' },
    fix: { kind: 'none' },
    rank: 4,
  },
];

export function issues(locale: string) {
  const ctx = context(locale);
  const previews = [
    { savedMin: 65, movedTo: { stableId: id(22), time: '14:30' } },
    { nearer: 'Jimbaran', nearerSavedMin: 95, nearerLegMin: 20 },
    { swap: { to: '16:30', withName: 'Karsa Spa' } },
  ];
  return {
    /** `byHand`: on an organiser's own draft, where a card opens its stop instead of a fix. */
    cards: (member: boolean, open: boolean, byHand = false): IssueCardProps[] =>
      ISSUES.map((issue, index) => {
        const w = issueWords(issue, ctx);
        const date = ctx.dayDate(issue.day_id);
        return {
          id: issue.id,
          tags: [
            kindTag(issue.kind),
            ...(date === null ? [] : [{ label: dayTag(date), color: kindTag(issue.kind).color }]),
          ],
          title: w.title,
          body: w.body,
          summary: byHand ? null : fixSummary(issue, ctx, previews[index] ?? {}),
          fixLabel: byHand
            ? openByHandLabel(issue.stable_ids.length > 0)
            : fixKindLabel(issue, !member),
          busy: false,
          onFix: () => undefined,
          detail:
            open && issue.kind === 'too_far'
              ? {
                  line: nearerDetail('Jimbaran', 20, driveLine(95), driveLine(20)),
                  useLabel: nearerUseLabel(),
                  onUse: () => undefined,
                  onKeep: () => undefined,
                }
              : null,
        };
      }),
    know: KNOW.map((issue) => knowLine(issue, ctx)),
  };
}

export function checkedNow(): string {
  return checkedAgo(new Date().toISOString(), new Date());
}

export function october(locale: string): string {
  const month = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    new Date('2026-10-14T12:00:00Z'),
  );
  return locale.startsWith('en') ? month : month.toLocaleLowerCase(locale);
}

export function orderLabel(): string {
  return t({ id: 'plan.check.lessDriving.use', message: 'Use this order' });
}

export function museumLine(): string {
  return t({
    id: 'plan.check.lab.museum',
    message: 'Balinese painting, a garden, and a café that stays quiet.',
  });
}

export function when(date: string, time: string): string {
  return `${weekdayName(date)} ${time}`;
}

export const TUESDAY_STOPS = [
  { key: 'cook', point: { lat: -8.49, lng: 115.29 } },
  { key: 'forest', point: { lat: -8.519, lng: 115.259 } },
  { key: 'dinner', point: { lat: -8.508, lng: 115.271 } },
  { key: 'market', point: { lat: -8.507, lng: 115.263 } },
  { key: 'saraswati', point: { lat: -8.505, lng: 115.262 } },
];

export const FOUR = [
  { key: 'a', name: 'Alex', joinIndex: 2 },
  { key: 'j', name: 'Jordan', joinIndex: 3 },
  { key: 'd', name: 'Dev', joinIndex: 5 },
  { key: 'w', name: 'Winston', joinIndex: 0 },
];

export const CREW = [
  { name: 'Winston', joinIndex: 0, you: true, mustDo: 'Locavore NXT', saved: 4, placed: 4 },
  { name: 'Maya', joinIndex: 1, you: false, mustDo: 'Karsa Spa', saved: 6, placed: 5 },
  { name: 'Alex', joinIndex: 2, you: false, mustDo: 'Nusa Penida', saved: 4, placed: 3 },
  { name: 'Jordan', joinIndex: 3, you: false, mustDo: 'Batur sunrise', saved: 5, placed: 3 },
  { name: 'Rin', joinIndex: 4, you: false, mustDo: 'Cooking class', saved: 3, placed: 2 },
  { name: 'Dev', joinIndex: 5, you: false, mustDo: 'Babi guling', saved: 3, placed: 0 },
];

const block = (key: string, from: string, to: string, color: string, inTheWay = false) => ({
  key,
  start: Number(from.slice(0, 2)) * 60 + Number(from.slice(3)),
  end: Number(to.slice(0, 2)) * 60 + Number(to.slice(3)),
  color,
  inTheWay,
});

export function chart(unticked: ReadonlySet<string>): SwapChartProps {
  const moved = (key: string) => !unticked.has(key);
  return {
    rain: { from: 13 * 60, to: 15 * 60 },
    crowds: [0, 0, 0, 0, 0, 0, 0, 20, 30, 50, 90, 90, 90, 90, 90, 50, 50, 50, 20, 10, 0, 0, 0, 0],
    busyLevel: 70,
    now: [
      block('jatiluwih', '09:00', '12:00', tokens.color.blue, true),
      block('lunch', '12:30', '13:15', tokens.color.yellow),
      block('ridge', '14:00', '16:00', tokens.color.green.base, true),
      block('spa', '16:00', '18:00', tokens.color.pink),
      block('dinner', '19:30', '20:00', tokens.color.paper.base),
    ],
    swapped: [
      moved('jatiluwih')
        ? block('jatiluwih', '07:00', '10:00', tokens.color.blue)
        : block('jatiluwih', '09:00', '12:00', tokens.color.blue),
      block('lunch', '12:30', '13:15', tokens.color.yellow),
      moved('ridge')
        ? block('ridge', '16:30', '18:30', tokens.color.green.base)
        : block('ridge', '14:00', '16:00', tokens.color.green.base),
      moved('spa')
        ? block('spa', '14:00', '16:00', tokens.color.pink)
        : block('spa', '16:00', '18:00', tokens.color.pink),
      block('dinner', '19:30', '20:00', tokens.color.paper.base),
    ],
    width: 350,
    reducedMotion: false,
  };
}
