/**
 * Renders the crew live map the way the app does (Lingui, safe area, gestures, the local-first
 * stack) over synced rows seeded into the local database. The api is the network boundary: the
 * live snapshot comes from a recorded response run through the app's own parser.
 */
/* eslint-disable lingui/no-unlocalized-strings -- test support; literals are fixtures and SQL. */
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { configure, render } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import type { TestLocalFirst } from '@/data/powersync/test-support/local-first-fixture';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { parseSnapshotResponse, type LiveMapServices, type OwnFix } from '../data/services';
import { LiveMapScreen } from '../screen';
import recorded from './snapshot.fixture.json';

configure({ asyncUtilTimeout: 5000 });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

import { ALEX, CREW, JORDAN, MAYA, MEETUP, MY_SHARE, NOW, RIN, TRIP } from './ids';

export { ALEX, CREW, DEV, JORDAN, MAYA, MEETUP, MY_SHARE, NOW, RIN, TRIP } from './ids';

export interface SnapshotAnswer {
  readonly status: number;
  readonly body: unknown;
}

/** The recorded snapshot as the api answered it, adjusted per test. */
export function recordedSnapshot(adjust?: (body: typeof recorded) => unknown): SnapshotAnswer {
  const copy = JSON.parse(JSON.stringify(recorded)) as typeof recorded;
  return { status: 200, body: adjust === undefined ? copy : adjust(copy) };
}

export function fakeServices(options: {
  readonly answer: SnapshotAnswer | null;
  readonly ownFix?: OwnFix | null;
  readonly lowPower?: boolean;
  readonly now?: number;
}): LiveMapServices & { readonly calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    loadSnapshot: (tripId) => {
      calls.push(tripId);
      return Promise.resolve(
        options.answer === null
          ? { kind: 'unavailable' as const }
          : parseSnapshotResponse(options.answer.status, options.answer.body),
      );
    },
    watchOwnFix: (listener) => {
      if (options.ownFix != null) listener(options.ownFix);
      return () => undefined;
    },
    isLowPowerMode: () => options.lowPower ?? false,
    now: () => options.now ?? NOW,
  };
}

export function renderLiveMap(stack: TestLocalFirst, services: LiveMapServices) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  return render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <LocalFirstProvider value={stack.value}>
            <ScreenJoltProvider>
              <LiveMapScreen services={services} />
            </ScreenJoltProvider>
          </LocalFirstProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

/**
 * The Bali Six on day 4 of 5 in Ubud: me (Dev), Maya, Rin, Alex and Jordan; boosted unless told
 * otherwise; my share open (paused when asked); a meet-up at Campuhan Ridge at 17:00.
 */
export async function seedTrip(
  stack: TestLocalFirst,
  options: {
    readonly boosted?: boolean;
    readonly status?: string;
    readonly myShare?: 'on' | 'paused' | 'off';
    readonly meetup?: boolean;
  } = {},
): Promise<void> {
  const { db, uid } = stack;
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    uid,
  ]);
  await db.execute('INSERT INTO crews (id, name) VALUES (?, ?)', [CREW, 'The Bali Six']);
  const people: [string, string][] = [
    [MAYA, 'Maya Tran'],
    [RIN, 'Rin'],
    [ALEX, 'Alex'],
    [JORDAN, 'Jordan'],
    [uid, 'Dev'],
  ];
  for (const [index, [id, name]] of people.entries()) {
    await db.execute('INSERT INTO users (id, display_name) VALUES (?, ?)', [id, name]);
    await db.execute(
      `INSERT INTO crew_members (id, crew_id, user_id, status, created_at)
       VALUES (?, ?, ?, 'active', ?)`,
      [`cm-${id}`, CREW, id, `2026-09-0${index + 1}T00:00:00Z`],
    );
  }
  await db.execute(
    'INSERT INTO crew_contact_cards (id, crew_id, user_id, phone_display) VALUES (?, ?, ?, ?)',
    ['cc-maya', CREW, MAYA, '+62 812 555 0101'],
  );
  await db.execute(
    `INSERT INTO trips (id, crew_id, status, phase, start_date, end_date, tz, created_at)
     VALUES (?, ?, ?, 'in', '2026-10-15', '2026-10-19', 'Asia/Makassar', '2026-09-01')`,
    [TRIP, CREW, options.status ?? 'in_trip'],
  );
  await db.execute(
    'INSERT INTO trip_entitlements (id, trip_id, boost_active, live_map) VALUES (?, ?, ?, ?)',
    [TRIP, TRIP, options.boosted === false ? 0 : 1, options.boosted === false ? 0 : 1],
  );
  const mine = options.myShare ?? 'on';
  if (mine !== 'off') {
    await db.execute(
      `INSERT INTO location_shares (id, trip_id, user_id, reason, starts_at, ends_at, paused)
       VALUES (?, ?, ?, 'crew_map', '2026-10-18T07:00:00Z', '2026-10-19T16:00:00Z', ?)`,
      [MY_SHARE, TRIP, uid, mine === 'paused' ? 1 : 0],
    );
  }
  if (options.meetup !== false) {
    await db.execute(
      `INSERT INTO meetups (id, trip_id, place_name, lat, lng, meet_at, created_by, status, arrived)
       VALUES (?, ?, 'Campuhan Ridge', -8.5031, 115.2544, '2026-10-18T09:00:00Z', ?, 'active', '{}')`,
      [MEETUP, TRIP, MAYA],
    );
  }
}
