/**
 * Lab scenes for Ideas (7f-2) and Tokek placing them (7h-6) over the Bali week: eight saved places
 * with their fit lines (through the app's fit line), a row lifted over Saturday, Ideas empty, and
 * the placing screen mid-run, with nothing to place and failed.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { DayFit, FitReason, PlaceFit } from '@cp/domain';
import type { ReactNode } from 'react';
import { useSharedValue } from 'react-native-reanimated';

import { fitLine } from '@/data/fit/fit-line';
import { LAB_PHOTOS } from '@/data/media/dev/lab-place-photos';
import { useLocale } from '@/lib/i18n/use-locale';
import { dayTileColour } from '@/features/plan/overview/model/day-colour';

import { NO_TRIP_GUIDE } from '../../plan-guide';
import { CREW, useLabDays } from '../../add/dev/add-scenes';
import { labStopName } from '../../review/dev/changes-scenes';
import type { ChipLayout, ChipRowFrame } from '../drag-hit';
import { ideaIcon } from '../idea-icon';
import { IdeaRow } from '../idea-row';
import { IdeasView } from '../ideas-view';
import type { MapPin } from '../placing/placing-map';
import {
  dayNames,
  failedFoot,
  lineTexts,
  nothingFoot,
  placingFoot,
  placingTitle,
} from '../placing/placing-copy';
import { PlacingView, type PlacingLine } from '../placing/placing-view';
import { INITIAL_PLACING, PLACING_STEPS, type PlacingState } from '../placing/progress';
import {
  backToIdeas,
  beforePlanBody,
  bodyText,
  draftBodyText,
  emptyBody,
  emptyLine,
  findPlacesLabel,
  fitsNeedPlan,
  placeLine,
} from '../ideas-copy';

const noop = () => undefined;
const TZ = 'Asia/Makassar';
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
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function fit(
  dayNo: number,
  time: string | null,
  reasons: FitReason[],
  extra: Partial<DayFit> = {},
): PlaceFit {
  const date = DATES[dayNo - 1] ?? DATES[0] ?? '';
  const slot =
    time === null
      ? null
      : { starts_at: `${date}T${time}:00+08:00`, ends_at: `${date}T${time}:00+08:00` };
  const day: DayFit = {
    day_id: id(100 + dayNo),
    day_no: dayNo,
    grade: 'good',
    slot,
    reasons,
    ...extra,
  };
  return {
    poi_id: id(dayNo),
    best:
      slot === null || day.grade === 'no'
        ? null
        : { day_id: day.day_id, day_no: dayNo, grade: day.grade, slot },
    days: [day],
  };
}

export const IDEAS = [
  {
    name: 'Tirta Empul',
    photo: LAB_PHOTOS.temple,
    category: 'temple_shrine',
    savers: [2, 4],
    fit: fit(6, '08:00', []),
  },
  {
    name: 'Seniman Coffee',
    photo: LAB_PHOTOS.food,
    category: 'food',
    savers: [5],
    fit: fit(3, '16:00', [
      { code: 'on_the_way', params: { stable_id: id(905), detour_minutes: 5 } },
    ]),
  },
  {
    name: 'Tibumana',
    photo: LAB_PHOTOS.generic,
    category: 'nature',
    savers: [0],
    fit: fit(6, '10:15', [{ code: 'after_item', params: { stable_id: id(901) } }]),
  },
  {
    name: 'Goa Gajah',
    category: 'temple_shrine',
    savers: [4],
    fit: fit(4, '16:30', [{ code: 'after_item', params: { stable_id: id(902) } }]),
  },
  {
    name: 'Gianyar Night Market',
    category: 'market',
    savers: [5],
    fit: fit(5, '19:00', [{ code: 'after_item', params: { stable_id: id(903) } }]),
  },
  {
    name: 'Single Fin',
    photo: LAB_PHOTOS.generic,
    category: 'beach',
    savers: [3],
    fit: fit(7, '19:15', [{ code: 'after_item', params: { stable_id: id(904) } }]),
  },
  {
    name: 'Pura Lempuyang',
    photo: LAB_PHOTOS.temple,
    category: 'temple_shrine',
    savers: [1, 3],
    fit: fit(2, '07:00', [{ code: 'crew_split', params: { want: 2, rather_not: 2 } }], {
      grade: 'possible',
    }),
  },
  {
    name: 'Sari Organik',
    photo: LAB_PHOTOS.food,
    category: 'food',
    savers: [1],
    fit: fit(3, '12:30', [{ code: 'needs_move', params: { stable_id: id(905) } }], {
      grade: 'possible',
      needs_move: id(905),
    }),
  },
];

function IdeasScene({
  empty = false,
  dragging = false,
  before,
}: {
  readonly empty?: boolean;
  readonly dragging?: boolean;
  /** Before the crew has a plan: an organiser on her own draft, or a member with none to see. */
  readonly before?: 'draft' | 'member';
}) {
  const locale = useLocale();
  const days = useLabDays(false);
  const frame = useSharedValue<ChipRowFrame>({ x: 0, y: 0, width: 0, height: 0 });
  const layout = useSharedValue<ChipLayout>({ count: 8, gap: 6, slotWidth: null, scrollX: 0 });
  const weekdays = new Map(
    DATES.map((date, index) => [
      index + 1,
      new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
        new Date(`${date}T12:00:00Z`),
      ),
    ]),
  );
  const context = { weekdays, tz: TZ, stopName: labStopName(locale) };
  const lifted = IDEAS[0];
  const grades = new Map([
    [6, 'good' as const],
    [3, 'possible' as const],
    [7, 'possible' as const],
  ]);
  const usual = bodyText(IDEAS.length, NO_TRIP_GUIDE.name);
  const bodies = {
    member: beforePlanBody(IDEAS.length, 'Linh'),
    draft: draftBodyText(IDEAS.length),
  };
  const shown = before === 'member' ? [] : days;
  return (
    <IdeasView
      body={empty ? emptyBody() : before === undefined ? usual : bodies[before]}
      days={dragging ? shown.map((day) => ({ ...day, fit: grades.get(day.dayNo) ?? 'no' })) : shown}
      dropTarget={dragging ? { overDayNo: 6 } : undefined}
      chipsRef={{ current: null }}
      place={
        empty || before !== undefined ? null : { line: placeLine(6, 2), busy: false, onPress: noop }
      }
      empty={
        empty
          ? {
              guide: 'Tokek',
              line: emptyLine(),
              find: { label: findPlacesLabel(), onPress: noop },
            }
          : null
      }
      rows={IDEAS.map((idea, index) => (
        <IdeaRow
          key={idea.name}
          ideaId={id(300 + index)}
          name={idea.name.toUpperCase()}
          icon={ideaIcon(idea.category)}
          photo={'photo' in idea ? idea.photo : undefined}
          fitLine={
            before === 'member'
              ? { text: fitsNeedPlan(), tone: 'none' }
              : (fitLine(idea.fit, context) ?? undefined)
          }
          savers={idea.savers.flatMap((n) => (CREW[n] === undefined ? [] : [CREW[n]]))}
          frame={frame}
          layout={layout}
          onLift={noop}
          onOver={noop}
          onDrop={noop}
          onCancel={noop}
          onOpen={noop}
          onAddToDay={before === 'member' ? null : noop}
          onMore={noop}
        />
      ))}
      scrolls={lifted !== undefined}
      onBack={noop}
      onMap={noop}
    />
  );
}

const PINS: MapPin[] = IDEAS.map((idea, index) => ({
  id: id(300 + index),
  lat: -8.5 + ((index * 37) % 11) / 100,
  lng: 115.2 + ((index * 53) % 13) / 100,
  icon: ideaIcon(idea.category),
  stop: null,
}));

function PlacingScene({ outcome }: { readonly outcome?: 'nothing' | 'failed' }) {
  const locale = useLocale();
  const days = new Map([
    [3, '2026-10-14'],
    [6, '2026-10-17'],
  ]);
  const state: PlacingState = {
    ...INITIAL_PLACING,
    left: outcome === 'nothing' ? [] : [{ idea_id: id(306), reason: 'split' }],
  };
  const texts = lineTexts(state, 8, dayNames([6, 3], days, locale));
  const status = {
    hours: 'done',
    locks: 'done',
    routing: outcome === undefined ? 'running' : 'done',
    needs_you: outcome === 'failed' ? 'failed' : outcome === 'nothing' ? 'done' : 'pending',
  } as const;
  const lines: PlacingLine[] = PLACING_STEPS.map((step) => ({
    key: step,
    text: texts[step] ?? '',
    status: status[step],
  }));
  const pins = PINS.map((pin, index) =>
    outcome === undefined && index === 0
      ? { ...pin, stop: { number: 2, color: dayTileColour(6) } }
      : pin,
  );
  return (
    <PlacingView
      title={placingTitle(8)}
      pins={pins}
      lines={lines}
      foot={
        outcome === 'failed'
          ? failedFoot(NO_TRIP_GUIDE.name)
          : outcome === 'nothing'
            ? nothingFoot()
            : placingFoot(NO_TRIP_GUIDE.name)
      }
      outcome={outcome === undefined ? null : { action: backToIdeas(), onAction: noop }}
      onLeave={noop}
    />
  );
}

export const IDEAS_SCENES: Readonly<Record<string, () => ReactNode>> = {
  ideas: () => <IdeasScene />,
  'ideas-dragging': () => <IdeasScene dragging />,
  'ideas-empty': () => <IdeasScene empty />,
  'ideas-own-draft': () => <IdeasScene before="draft" />,
  'ideas-before-plan': () => <IdeasScene before="member" />,
  placing: () => <PlacingScene />,
  'placing-nothing': () => <PlacingScene outcome="nothing" />,
  'placing-failed': () => <PlacingScene outcome="failed" />,
};
