/**
 * Lab scenes for review changes in the section 7 layout (7h-7) over the Bali week: six placed
 * ideas and two for you (Tokek's draft, only you see it), one row unticked with the totals
 * recounted, the SEE explainer open, a fix set, and the crew's vote.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { FitReason } from '@cp/domain';
import type { ReactNode } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { dayTileColour } from '@/features/plan/overview/day-card';

import {
  backIdeasLabel,
  changesHeadline,
  leftLine,
  needsMoveExplainer,
  onlyYouLabel,
  placedHeadline,
  placedReason,
  tallyLine,
} from '../changes-copy';
import { calmSummary } from '../changes-state-copy';
import { NO_TRIP_GUIDE } from '../../plan-guide';
import { ChangesReviewView, type ChangeRow } from '../changes-review-view';
import { ChangesTotals } from '../changes-totals';
import type { LeftForYou } from '../data/use-review-extras';
import { noticeText, sendLabel } from '../review-copy';

const noop = () => undefined;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** The plan's own stop labels, as the crew wrote them in each language. */
const STOPS: Readonly<Record<'en' | 'vi', Readonly<Record<number, string>>>> = {
  en: {
    901: 'Tirta Empul',
    902: 'the nap',
    903: 'the boat',
    904: 'the kecak',
    905: 'Wednesday’s lunch',
  },
  vi: {
    901: 'Tirta Empul',
    902: 'giấc ngủ trưa',
    903: 'chuyến thuyền',
    904: 'buổi kecak',
    905: 'bữa trưa thứ Tư',
  },
};
export function labStopName(locale: string) {
  const names = locale.startsWith('vi') ? STOPS.vi : STOPS.en;
  return (stableId: string) => names[Number(stableId.slice(-3))] ?? null;
}
const quiet: FitReason = { code: 'quiet_until', params: { time: '10:00', source: 'editorial' } };
const after = (n: number): FitReason => ({ code: 'after_item', params: { stable_id: id(n) } });
const onWay: FitReason = { code: 'on_the_way', params: { stable_id: id(901), detour_minutes: 5 } };

const PLACED: { name: string; date: string; dayNo: number; time: string; reasons: FitReason[] }[] =
  [
    { name: 'Tirta Empul', date: '2026-10-17', dayNo: 6, time: '08:00', reasons: [quiet] },
    { name: 'Tibumana', date: '2026-10-17', dayNo: 6, time: '10:15', reasons: [onWay] },
    { name: 'Seniman Coffee', date: '2026-10-14', dayNo: 3, time: '16:00', reasons: [after(905)] },
    { name: 'Goa Gajah', date: '2026-10-15', dayNo: 4, time: '16:30', reasons: [after(902)] },
    {
      name: 'Gianyar Night Market',
      date: '2026-10-16',
      dayNo: 5,
      time: '19:00',
      reasons: [after(903)],
    },
    { name: 'Single Fin', date: '2026-10-18', dayNo: 7, time: '19:15', reasons: [after(904)] },
  ];

const LEFT: LeftForYou[] = [
  {
    ideaId: id(306),
    poiId: id(406),
    name: 'Pura Lempuyang',
    reason: 'split',
    needsMove: null,
    fit: {
      poi_id: id(406),
      best: null,
      days: [
        {
          day_id: id(102),
          day_no: 2,
          grade: 'possible',
          slot: null,
          reasons: [{ code: 'crew_split', params: { want: 2, rather_not: 2 } }],
        },
      ],
      version_id: id(900),
      computed_at: '2026-10-04T00:00:00Z',
    },
  },
  {
    ideaId: id(307),
    poiId: id(407),
    name: 'Sari Organik',
    reason: 'needs_move',
    needsMove: id(905),
    fit: null,
  },
];

interface Variant {
  readonly unticked?: boolean;
  readonly explained?: boolean;
  readonly fixes?: boolean;
  readonly voting?: boolean;
  readonly approved?: boolean;
}

function ChangesScene({
  unticked = false,
  explained = false,
  fixes = false,
  voting = false,
  approved = false,
}: Variant) {
  const settled = voting || approved;
  const locale = useLocale();
  const stopName = labStopName(locale);
  const rows: ChangeRow[] = PLACED.map((stop, index) => ({
    key: id(500 + index),
    dayTag: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
      .format(new Date(`${stop.date}T12:00:00Z`))
      .toUpperCase(),
    dayColor: dayTileColour(stop.dayNo),
    title: `+ ${stop.name.toUpperCase()}`,
    detail: `${stop.time} · ${placedReason(stop.reasons, stopName)}`,
    accepted: !(unticked && index === 1),
  }));
  const kept = rows.filter((row) => row.accepted).length;
  return (
    <ChangesReviewView
      state="ready"
      backLabel={backIdeasLabel()}
      onBack={noop}
      onlyYou={settled ? null : onlyYouLabel()}
      title={fixes ? changesHeadline('check', 2) : placedHeadline(6, approved ? 0 : 2)}
      summary={calmSummary()}
      rows={fixes ? rows.slice(0, 2) : rows}
      onToggle={settled ? null : noop}
      needsYou={
        fixes || approved
          ? []
          : LEFT.map((idea) => ({
              key: idea.ideaId,
              name: idea.name.toUpperCase(),
              line: leftLine(idea, stopName),
              explainer:
                explained && idea.reason === 'needs_move'
                  ? needsMoveExplainer(stopName(id(905)), NO_TRIP_GUIDE.name)
                  : null,
              onSee: noop,
            }))
      }
      totals={
        <ChangesTotals
          numbers={{
            eachMinor: unticked ? 15_000_000 : 21_000_000,
            currency: 'IDR',
            bookingsMoved: 0,
            mustDosTouched: 0,
          }}
          drivingMin={unticked ? 55 : 80}
        />
      }
      send={
        settled
          ? null
          : {
              label: sendLabel({ kind: 'vote', needed: 3, affected: [] }).toUpperCase(),
              disabled: kept === 0,
              busy: false,
              onPress: noop,
            }
      }
      personal={approved ? null : { busy: false, onPress: noop }}
      vote={voting ? { line: tallyLine(1, 3), canVote: true, onYes: noop, onNo: noop } : null}
      notice={approved ? noticeText('approved') : null}
    />
  );
}

export const CHANGES_SCENES: Readonly<Record<string, () => ReactNode>> = {
  review: () => <ChangesScene />,
  'review-unticked': () => <ChangesScene unticked />,
  'review-explained': () => <ChangesScene explained />,
  'review-fixes': () => <ChangesScene fixes />,
  'review-voting': () => <ChangesScene voting />,
  'review-approved': () => <ChangesScene approved />,
};
