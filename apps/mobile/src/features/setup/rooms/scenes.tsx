/**
 * Fixed rooms scenes (developer tools and device screenshots): the Kyoto six in a ryokan for two
 * nights (three doubles, grouped as the render shows) then an apartment for five with the same
 * pairs, at $470 each; and the states around it. Real view, fixed rows, no database.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture data and scene ids, never copy. */
import type { SetupTrip } from '../data/setup-trip';
import { ALEX, DEV, JORDAN, kyotoTrip, MAYA, RIN, sceneFrame, WINSTON } from '../scenes/fixtures';
import type { SetupScene } from '../scenes/types';
import { buildPlan, perPersonPrice, type AssignmentRow, type PlanRow } from './model';
import { RoomsView, type RoomsModel } from './rooms-view';

type Layout = readonly (readonly [string, readonly string[], string | null, number?])[];

const RENDER: Layout = [
  ['room-1', [MAYA, RIN], 'light_sleepers'],
  ['room-2', [WINSTON, ALEX], 'early_risers'],
  ['room-3', [JORDAN, DEV], 'night_owls'],
];

function planRow(layout: Layout, options: { samePairs?: boolean; booked?: boolean } = {}): PlanRow {
  const rooms = [
    ['stay-1', 'ryokan', 2, 22_000],
    ['stay-2', 'apartment', 5, 10_000],
  ].flatMap(([stayKey, type, nights, nightly]) =>
    layout.map(([key, uids, , price], index) => ({
      stay_key: stayKey,
      stay_type: type,
      stay_nights: nights,
      key,
      capacity: uids.length === 1 && key === 'room-3' && layout.length === 3 ? 1 : 2,
      nightly_minor: (price ?? (nightly as number)) * (uids.length === 1 ? 1 : 1),
      label: `Room ${index + 1}`,
    })),
  );
  return {
    stay_option_id: 'ryokan',
    rooms: JSON.stringify(rooms),
    currency: 'USD',
    version: 4,
    same_pairs_all_stays: options.samePairs === false ? 0 : 1,
    locked_at: null,
    stay_booking_id: options.booked === true ? 'booking-1' : null,
    free_cancel_until: options.booked === true ? '2027-03-19' : null,
  };
}

function assignments(layout: Layout): AssignmentRow[] {
  return ['stay-1', 'stay-2'].flatMap((stayKey) =>
    layout.flatMap(([roomKey, uids, trait]) =>
      uids.map((uid) => ({
        stay_key: stayKey,
        room_key: roomKey,
        user_id: uid,
        trait_label: trait,
      })),
    ),
  );
}

const STAYS = [
  { type: 'ryokan', estimate: '$180–$220' },
  { type: 'apartment', estimate: '$90–$100' },
  { type: 'hostel', estimate: '$40–$55' },
];

function model(
  trip: SetupTrip,
  layout: Layout | null,
  extra: Partial<RoomsModel> & { samePairs?: boolean; booked?: boolean } = {},
): RoomsModel {
  const plan =
    layout === null
      ? null
      : buildPlan(
          planRow(layout, {
            ...(extra.samePairs === undefined ? {} : { samePairs: extra.samePairs }),
            ...(extra.booked === undefined ? {} : { booked: extra.booked }),
          }),
          assignments(layout),
          [],
        );
  return {
    plan,
    stays: STAYS,
    stayUnavailable: false,
    price: plan === null ? null : perPersonPrice(plan, trip.me, 2),
    currency: plan === null ? null : 'USD',
    skippable: false,
    notice: null,
    myChips: [],
    swapAsked: false,
    locking: false,
    ...extra,
  };
}

const noop = () => undefined;
const ACTIONS = {
  onMove: noop,
  onSeparate: noop,
  onPickStay: noop,
  onLock: noop,
  onSkip: noop,
  onToggleChip: noop,
  onAskSwap: noop,
};

function scene(
  name: string,
  build: () => { trip: SetupTrip; model: RoomsModel; offline?: boolean; reject?: boolean },
): SetupScene {
  return {
    name,
    render: () => {
      const { trip, model: m, offline, reject } = build();
      return (
        <RoomsView
          trip={trip}
          shell={sceneFrame(trip, 'rooms', { offline: offline === true })}
          model={m}
          actions={ACTIONS}
          initialReject={reject === true ? { stayKey: 'stay-1', roomKey: 'room-1' } : undefined}
        />
      );
    },
  };
}

const organiser = () => kyotoTrip({ step: 'rooms', dates: true });
const member = () => kyotoTrip({ step: 'rooms', dates: true, me: MAYA });
const ODD: Layout = [
  ['room-1', [MAYA, RIN], 'light_sleepers'],
  ['room-2', [WINSTON, ALEX], 'early_risers'],
  ['room-3', [JORDAN], 'night_owls'],
];
const UNEQUAL: Layout = [
  ['room-1', [MAYA, RIN], 'light_sleepers', 30_000],
  ['room-2', [WINSTON, ALEX], 'early_risers'],
  ['room-3', [JORDAN, DEV], 'night_owls', 16_000],
];

export const ROOMS_SCENES: readonly SetupScene[] = [
  scene('3c-6-rooms', () => {
    const trip = organiser();
    return { trip, model: model(trip, RENDER) };
  }),
  scene('rooms-member', () => {
    const trip = member();
    return { trip, model: model(trip, RENDER, { myChips: ['light_sleeper'] }) };
  }),
  scene('rooms-prefs-missing', () => {
    const trip = member();
    return { trip, model: model(trip, null) };
  }),
  scene('rooms-pick-stay', () => {
    const trip = organiser();
    return { trip, model: model(trip, null) };
  }),
  // No stay prices for the place and one room for everyone: LOOKS GOOD accepts the even split.
  scene('rooms-even-split', () => {
    const trip = organiser();
    return { trip, model: model(trip, null, { stays: [], skippable: true }) };
  }),
  scene('rooms-odd-crew', () => {
    const trip = organiser();
    return { trip, model: model(trip, ODD) };
  }),
  scene('rooms-unequal-prices', () => {
    const trip = organiser();
    return { trip, model: model(trip, UNEQUAL, { samePairs: false }) };
  }),
  scene('rooms-stay-unavailable', () => {
    const trip = organiser();
    return { trip, model: model(trip, RENDER, { stayUnavailable: true }) };
  }),
  scene('rooms-conflict', () => {
    const trip = organiser();
    return { trip, model: model(trip, RENDER, { notice: 'conflict' }) };
  }),
  scene('rooms-over-capacity', () => {
    const trip = organiser();
    return { trip, model: model(trip, RENDER), reject: true };
  }),
  scene('rooms-booked', () => {
    const trip = organiser();
    return { trip, model: model(trip, RENDER, { booked: true }) };
  }),
  scene('rooms-offline', () => {
    const trip = organiser();
    return { trip, model: model(trip, RENDER, { notice: 'lock_offline' }), offline: true };
  }),
];
