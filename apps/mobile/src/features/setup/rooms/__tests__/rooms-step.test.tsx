/**
 * The rooms step over the real local-first stack (encrypted local database, upload queue, command
 * client) with synced rows seeded as sync would write them: moving someone queues
 * `set_room_assignment` on the plan's version and redraws both rooms and the per-person price at
 * once; a full room refuses the move without a command; a member sees the plan read-only and can
 * ask to swap.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import {
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { TravelDataReaderProvider } from '@/data/travel-data/client';
import { recordedReader } from '@/data/travel-data/test-support/recorded-reader';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import {
  ALEX,
  DEV,
  JORDAN,
  kyotoTrip,
  MAYA,
  RIN,
  sceneFrame,
  TRIP_ID,
  WINSTON,
} from '../../scenes/fixtures';
import { moveGuest } from '../model';
import { RoomsStep, toggleChip } from '../rooms-step';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

configure({ asyncUtilTimeout: 5000 });

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

/** A ryokan for two nights then an apartment for five, same pairs; Dev joined after the plan. */
async function seed(db: TestLocalFirst['db']): Promise<void> {
  const rooms = [
    ['stay-1', 'ryokan', 2, 22_000],
    ['stay-2', 'apartment', 5, 10_000],
  ].flatMap(([stayKey, type, nights, nightly]) =>
    ['room-1', 'room-2', 'room-3'].map((key, index) => ({
      stay_key: stayKey,
      stay_type: type,
      stay_nights: nights,
      key,
      capacity: 2,
      nightly_minor: nightly,
      label: `Room ${index + 1}`,
    })),
  );
  await db.execute(
    `INSERT INTO room_plans (id, trip_id, stay_option_id, rooms, currency, nights, version,
       same_pairs_all_stays, is_stale)
     VALUES (?, ?, 'ryokan', ?, 'USD', 7, 4, 1, 0)`,
    [TRIP_ID, TRIP_ID, JSON.stringify(rooms)],
  );
  const layout: [string, string, string | null][] = [
    ['room-1', MAYA, 'light_sleepers'],
    ['room-1', RIN, 'light_sleepers'],
    ['room-2', WINSTON, 'early_risers'],
    ['room-2', ALEX, 'early_risers'],
    ['room-3', JORDAN, 'night_owls'],
  ];
  for (const stayKey of ['stay-1', 'stay-2']) {
    for (const [index, [roomKey, uid, trait]] of layout.entries()) {
      await db.execute(
        `INSERT INTO room_assignments (id, trip_id, stay_key, room_key, user_id, trait_label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [`${stayKey}-${uid}`, TRIP_ID, stayKey, roomKey, uid, trait, `2026-10-01T00:00:0${index}Z`],
      );
    }
  }
}

async function renderRooms(uid: string) {
  stack = await openTestLocalFirst({ uid, holdUploads: true });
  await seed(stack.db);
  const trip = kyotoTrip({ step: 'rooms', dates: true, me: uid });
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <LocalFirstProvider value={stack.value}>
            <ScreenJoltProvider>
              <RoomsStep trip={trip} shell={sceneFrame(trip, 'rooms')} />
            </ScreenJoltProvider>
          </LocalFirstProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
  await screen.findByTestId('setup-rooms-room-room-1');
  return stack;
}

async function queued(db: TestLocalFirst['db'], cmd: string) {
  const rows = await db.getAll<{ envelope: string }>(
    'SELECT envelope FROM commands WHERE cmd = ? ORDER BY seq',
    [cmd],
  );
  return rows.map(
    (row) => (JSON.parse(row.envelope) as { payload: Record<string, unknown> }).payload,
  );
}

describe('organiser moves people', () => {
  it('queues the move on the plan version and redraws the rooms and the price', async () => {
    const { db } = await renderRooms(WINSTON);
    // Dev joined after the rooms were made, so Jordan has room 3 alone and pays more.
    expect(screen.getByTestId('setup-rooms-unplaced')).toBeTruthy();
    expect(screen.getByTestId('setup-rooms-price-low')).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`setup-rooms-person-${DEV}`));
    await fireEvent.press(await screen.findByTestId('setup-rooms-move-room-3'));

    await waitFor(async () => expect(await queued(db, 'set_room_assignment')).toHaveLength(1));
    const [payload] = await queued(db, 'set_room_assignment');
    expect(payload).toEqual({
      trip_id: TRIP_ID,
      base_version: 4,
      rooms: [
        { stay_key: 'stay-1', room_key: 'room-1', uids: [MAYA, RIN] },
        { stay_key: 'stay-1', room_key: 'room-2', uids: [WINSTON, ALEX] },
        { stay_key: 'stay-1', room_key: 'room-3', uids: [JORDAN, DEV] },
      ],
    });
    await waitFor(() =>
      expect(
        within(screen.getByTestId('setup-rooms-room-room-3')).getByTestId(
          `setup-rooms-person-${DEV}`,
        ),
      ).toBeTruthy(),
    );
    // Every room now has two people at the same price: one price for everyone.
    expect(screen.queryByTestId('setup-rooms-unplaced')).toBeNull();
    expect(screen.getByTestId('setup-rooms-price-each')).toBeTruthy();
  });

  it('bases the next move on the queued one', async () => {
    const { db } = await renderRooms(WINSTON);
    await fireEvent.press(screen.getByTestId(`setup-rooms-person-${RIN}`));
    await fireEvent.press(await screen.findByTestId('setup-rooms-move-room-3'));
    await waitFor(async () => expect(await queued(db, 'set_room_assignment')).toHaveLength(1));
    // The screen reads its queued moves back from the database a moment after they are written,
    // and a move starts from the plan on screen: until Rin shows in room 3, room 1 still looks
    // full and would refuse Dev without a command.
    await waitFor(() =>
      expect(
        within(screen.getByTestId('setup-rooms-room-room-3')).getByTestId(
          `setup-rooms-person-${RIN}`,
        ),
      ).toBeTruthy(),
    );
    await fireEvent.press(screen.getByTestId(`setup-rooms-person-${DEV}`));
    await fireEvent.press(await screen.findByTestId('setup-rooms-move-room-1'));
    await waitFor(async () => expect(await queued(db, 'set_room_assignment')).toHaveLength(2));
    const [, second] = await queued(db, 'set_room_assignment');
    expect(second).toMatchObject({ base_version: 5 });
    expect(second?.['rooms']).toContainEqual({
      stay_key: 'stay-1',
      room_key: 'room-1',
      uids: [MAYA, DEV],
    });
  });

  it('refuses a full room without sending anything', async () => {
    const { db } = await renderRooms(WINSTON);
    await fireEvent.press(screen.getByTestId(`setup-rooms-person-${MAYA}`));
    await fireEvent.press(await screen.findByTestId('setup-rooms-move-room-2'));
    expect(await screen.findByTestId('setup-rooms-full')).toBeTruthy();
    expect(await queued(db, 'set_room_assignment')).toHaveLength(0);
  });
});

describe('member view', () => {
  it('is read-only and asks the organiser to swap', async () => {
    const { db } = await renderRooms(MAYA);
    await fireEvent.press(screen.getByTestId(`setup-rooms-person-${RIN}`));
    expect(screen.queryByTestId('setup-rooms-move-room-3')).toBeNull();
    expect(screen.queryByTestId('setup-rooms-lock')).toBeNull();

    await fireEvent.press(screen.getByTestId('setup-rooms-ask-swap'));
    await waitFor(async () =>
      expect(await queued(db, 'request_room_swap')).toEqual([{ trip_id: TRIP_ID }]),
    );
    expect(await screen.findByTestId('setup-rooms-swap-sent')).toBeTruthy();
  });

  it('queues their room wishes', async () => {
    const { db } = await renderRooms(MAYA);
    await fireEvent.press(screen.getByTestId('setup-rooms-chip-light_sleeper'));
    await waitFor(async () =>
      expect(await queued(db, 'set_room_prefs')).toEqual([
        { trip_id: TRIP_ID, chips: ['light_sleeper'] },
      ]),
    );
  });
});

describe('no stay prices', () => {
  it('takes the organiser straight on to must-dos, and stays put if setup comes back', async () => {
    stack = await openTestLocalFirst({ uid: WINSTON, holdUploads: true });
    const trip = { ...kyotoTrip({ step: 'rooms', dates: true }), isSolo: true };
    const onSelectStep = jest.fn();
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    const tree = (
      <I18nProvider i18n={i18n}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <GestureHandlerRootView>
            <LocalFirstProvider value={stack.value}>
              <ScreenJoltProvider>
                <RoomsStep trip={trip} shell={{ ...sceneFrame(trip, 'rooms'), onSelectStep }} />
              </ScreenJoltProvider>
            </LocalFirstProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </I18nProvider>
    );
    // Nothing to decide (no stay on offer, no rooms): the step passes itself.
    const first = await render(tree);
    await waitFor(async () =>
      expect(await queued(stack!.db, 'set_setup_step')).toEqual([
        { trip_id: TRIP_ID, step: 'must_dos' },
      ]),
    );
    expect(onSelectStep).toHaveBeenCalledWith('must_dos');
    expect(screen.queryByTestId('setup-rooms-even')).toBeNull();
    await first.unmount();

    // Brought back here (a refused move, or the organiser opening the step): it is shown, and
    // LOOKS GOOD accepts the even split.
    await render(tree);
    expect(await screen.findByTestId('setup-rooms-even')).toBeTruthy();
    expect(screen.queryByTestId('setup-rooms-skip')).toBeNull();
    await fireEvent.press(screen.getByTestId('setup-rooms-lock'));
    await waitFor(async () => expect(await queued(stack!.db, 'set_setup_step')).toHaveLength(2));
    expect(await queued(stack.db, 'lock_rooms')).toHaveLength(0);
  });
});

describe('a stay pick the server refused after it was queued', () => {
  it('says the stay was not picked and why, until another is picked', async () => {
    stack = await openTestLocalFirst({ uid: WINSTON, holdUploads: true });
    const trip = kyotoTrip({ step: 'rooms', dates: true });
    await stack.db.execute("INSERT INTO destinations (id, name) VALUES ('dest-1', 'Kyoto')");
    await stack.db.execute(
      `INSERT INTO trips (id, crew_id, status, setup_step, destination_id)
       VALUES (?, 'crew-1', 'setup', 'rooms', 'dest-1')`,
      [TRIP_ID],
    );
    // The destination's one reviewed stay type, a hostel, as the api's cost index read answers it.
    const costs = recordedReader({ '/v1/destinations/': [200, 'cost-indices-hostel'] });
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    await render(
      <I18nProvider i18n={i18n}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <GestureHandlerRootView>
            <LocalFirstProvider value={stack.value}>
              <TravelDataReaderProvider value={costs}>
                <ScreenJoltProvider>
                  <RoomsStep trip={trip} shell={sceneFrame(trip, 'rooms')} />
                </ScreenJoltProvider>
              </TravelDataReaderProvider>
            </LocalFirstProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </I18nProvider>,
    );
    const option = await screen.findByTestId('setup-rooms-stay-option-hostel');
    expect(screen.queryByTestId('setup-rooms-notice')).toBeNull();
    // The pick was uploaded and the server answered that the stay has no price for this trip.
    await stack.db.execute(
      `INSERT INTO rejected_commands (id, cmd, code, detail, rejected_at)
       VALUES ('op-1', 'set_stay_choice', 'STATE_INVALID', ?, '2026-10-01T11:58:57Z')`,
      [JSON.stringify({ reason: 'stay_unavailable', stay: 'hostel' })],
    );
    const notice = await screen.findByTestId('setup-rooms-notice');
    expect(notice.props.children).toBe(
      'That stay has no price for this trip right now, so it wasn’t picked. Try another.',
    );
    await fireEvent.press(option);
    await waitFor(() => expect(screen.queryByTestId('setup-rooms-notice')).toBeNull());
  });
});

describe('rooms rules', () => {
  it('keeps "don’t care" on its own', () => {
    expect(toggleChip(['early_bird'], 'dont_care')).toEqual(['dont_care']);
    expect(toggleChip(['dont_care'], 'snorer')).toEqual(['snorer']);
    expect(toggleChip(['snorer'], 'snorer')).toEqual([]);
  });

  it('never fills a room past its beds', () => {
    const stay = {
      key: 'stay-1',
      type: 'ryokan',
      nights: 2,
      rooms: [
        { key: 'room-1', capacity: 2, nightlyMinor: 1, trait: null, occupants: [MAYA, RIN] },
        { key: 'room-2', capacity: 1, nightlyMinor: 1, trait: null, occupants: [] },
      ],
    };
    expect(moveGuest(stay, WINSTON, 'room-1').kind).toBe('full');
    const moved = moveGuest(stay, RIN, 'room-2');
    expect(moved.kind === 'moved' && moved.stay.rooms.map((r) => r.occupants)).toEqual([
      [MAYA],
      [RIN],
    ]);
  });
});
