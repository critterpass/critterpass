/**
 * Lab scenes for the planning place page (7e-1, 7e-2): Tirta Empul inside a trip as the organiser
 * and as a member, already in the plan, split in the crew, with no trip, and hours not known.
 * ♡ and the button work on the page; nothing is sent.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { MediaAsset } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useState, type ReactNode } from 'react';

import { guideFor } from '../../format';
import { LAB_PICK_MEDIA } from '../../trip-explore/dev/lab-pick-media';
import { readPlaceDetail } from '../context';
import { PlaceFurther } from '../further';
import {
  ctaLabel,
  detailCta,
  fitSentence,
  fromStayLabel,
  savedByLabel,
  splitCountLabel,
} from '../model';
import { PlaceDetailView } from '../place-detail-view';

const SAT = '0192f000-0000-7000-8000-0000000000d6';
const THU = '0192f000-0000-7000-8000-0000000000d4';
const SPRINGS = '0192f000-0000-7000-8000-0000000000e1';
const id = (n: number) => `0192f000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const WIRE = {
  poi_id: id(1),
  trip_id: id(2),
  stay: null,
  crowd: null,
  crew: { saved_by: ['a', 'r'], yes_by: [] },
  qna: {
    text: 'Jordan asked if he has to get in the water. He doesn’t.',
    source_at: '',
    updated_at: '',
  },
  in_plan: null,
  suggested_slot: null,
  add_mode: 'apply',
  base_version: id(3),
  from_stay: { name: 'Villa Sayan', minutes: 45, mode: 'drive', approx: true },
  when_it_fits: {
    best: {
      day_id: SAT,
      day_no: 3,
      date: '2026-10-17',
      start: '08:00',
      end: '09:30',
      starts_at: '2026-10-17T00:00:00.000Z',
      ends_at: '2026-10-17T01:30:00.000Z',
      grade: 'good',
      reasons: [
        { code: 'free_day', params: { day_no: 3 } },
        { code: 'busy_from', params: { time: '10:00', level: 90, source: 'editorial' } },
      ],
    },
    other_best: {
      day_id: THU,
      day_no: 1,
      date: '2026-10-15',
      start: '13:00',
      end: '14:30',
      starts_at: '2026-10-15T05:00:00.000Z',
      ends_at: '2026-10-15T06:30:00.000Z',
      grade: 'good',
      reasons: [{ code: 'after_item', params: { stable_id: SPRINGS } }],
    },
    days: [],
    bars: {
      from: 8,
      to: 17,
      hourly: [20, 30, 62, 74, 78, 70, 58, 46, 32],
      lit: { from: 8, to: 9 },
    },
  },
  facts: {
    open_spans: [{ from: '08:00', to: '17:00' }],
    hours_known: true,
    entry: 'Rp 75k',
    takes_min: 90,
    dress: 'Sarong',
  },
  tip: 'Start at the left pool and work right. Skip the last two spouts, they’re for funerals.',
  know: [
    { title: 'Sarongs are lent at the gate', detail: 'Free, leave a small donation' },
    { title: 'Bring dry clothes', detail: 'Lockers by the pools, Rp 5k' },
    { title: 'Photos yes, drones no' },
  ],
  nearby: [
    { poi_id: id(11), name: 'Gunung Kawi', category: 'temple_shrine', minutes: 10 },
    { poi_id: id(12), name: 'Sebatu', category: 'temple_shrine', minutes: 15 },
    { poi_id: id(13), name: 'Tegallalang', category: 'nature', minutes: 20 },
  ],
  similar: [
    { poi_id: id(21), name: 'Taman Saraswati', category: 'temple_shrine', minutes: 40 },
    { poi_id: id(22), name: 'Tirta Gangga', category: 'temple_shrine', minutes: 120 },
  ],
  split: null,
};

const SAVERS = [
  { key: 'a', name: 'Alex', joinIndex: 2 },
  { key: 'r', name: 'Rin', joinIndex: 3 },
];

function Scene({
  patch = {},
  trip = true,
  savedAtStart = false,
  photo = null,
}: {
  readonly patch?: Record<string, unknown>;
  readonly trip?: boolean;
  /** ♡ already on: the viewer saved it (the 7e-1 render). */
  readonly savedAtStart?: boolean;
  readonly photo?: MediaAsset | null;
}) {
  const { t, i18n } = useLingui();
  const [saved, setSaved] = useState(savedAtStart);
  const [added, setAdded] = useState<number | null>(null);
  const context = trip ? readPlaceDetail({ ...WIRE, ...patch }) : null;
  const guide = guideFor('tokek');
  const cta = detailCta({
    context,
    status: 'ready',
    tz: 'Asia/Makassar',
    locale: i18n.locale,
    addedDay: added,
  });
  const best = context?.fits?.best ?? null;
  const stances = context?.stances ?? null;
  return (
    <PlaceDetailView
      name="Tirta Empul"
      category="temple_shrine"
      guide={guide}
      photo={photo}
      heroUrl={null}
      saved={saved}
      offline={false}
      onBack={() => undefined}
      onShare={() => undefined}
      onToggleSave={() => setSaved((s) => !s)}
      savedBy={trip ? savedByLabel(['Alex', 'Rin']) : null}
      split={
        stances?.split === true
          ? {
              label: splitCountLabel(stances.want.length, stances.ratherNot.length),
              onPress: () => undefined,
            }
          : null
      }
      meta={['Tampaksiring', ...(trip ? [fromStayLabel(45, 'Villa Sayan')] : [])]}
      facts={context?.facts ?? null}
      fits={
        best === null
          ? null
          : {
              best,
              sentence: fitSentence(context?.fits ?? null, {
                locale: i18n.locale,
                stopName: (stable) => (stable === SPRINGS ? 'Sebatu' : null),
              }),
              bars: context?.fits?.bars ?? null,
              onOtherDays: () => undefined,
            }
      }
      fitNote={
        trip
          ? context?.facts?.hoursKnown === false
            ? t({
                id: 'explore.detail.hoursUnknown',
                message: "Its hours aren't known, so I can't fit it yet.",
              })
            : null
          : 'Go at opening, before the tour buses.'
      }
      crew={trip ? { keen: SAVERS, qna: context?.qna?.text ?? null, savers: true } : null}
      further={
        <PlaceFurther
          guide={guide}
          context={context}
          tip={context?.tip ?? WIRE.tip}
          live={null}
          offers={null}
          onPlace={() => undefined}
          addPlace={() => '/explore'}
        />
      }
      cta={{
        label: trip
          ? ctaLabel(cta)
          : t({ id: 'explore.detail.planTrip', message: 'Plan a trip here' }),
        tone: cta.kind === 'inPlan' ? 'green' : 'yellow',
        disabled: trip && cta.kind !== 'add' && cta.kind !== 'inPlan',
        busy: false,
        onPress: () => setAdded(best?.day_no ?? null),
      }}
      onChat={() => undefined}
      onGo={() => undefined}
    />
  );
}

export const PLACE_DETAIL_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'place-detail': () => <Scene savedAtStart photo={LAB_PICK_MEDIA['tirta-empul'] ?? null} />,
  // A stock photo standing in for the place: the hero says it is not this place.
  'place-detail-member': () => (
    <Scene patch={{ add_mode: 'changeset' }} photo={LAB_PICK_MEDIA.campuhan ?? null} />
  ),
  'place-detail-in-plan': () => (
    <Scene
      patch={{ in_plan: { day_no: 3, stable_id: id(9), starts_at: '2026-10-17T00:00:00.000Z' } }}
    />
  ),
  'place-detail-split': () => (
    <Scene
      patch={{
        split: { want: ['m', 'j'], rather_not: ['a', 'd'], silent_user_ids: ['r'], split: true },
      }}
    />
  ),
  'place-detail-no-trip': () => <Scene trip={false} />,
  'place-detail-hours-unknown': () => (
    <Scene
      patch={{
        when_it_fits: null,
        facts: { open_spans: [], hours_known: false, takes_min: 90 },
      }}
    />
  ),
};
