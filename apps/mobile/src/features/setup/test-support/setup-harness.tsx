/**
 * Renders setup screens the way the app does (Lingui, safe area, gestures, the local-first stack,
 * setup services) over synced rows seeded into the local database. The api is the network
 * boundary: `fakeSetupServices` answers reads with recorded bodies.
 */
/* eslint-disable lingui/no-unlocalized-strings -- test support; literals are fixtures and SQL. */
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { configure, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import type { TestLocalFirst } from '@/data/powersync/test-support/local-first-fixture';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { SetupServicesProvider, type ApiRead, type SetupServices } from '../data/services';
import { ALEX, DEV, JORDAN, MAYA, RIN, SCENE_NOW, TRIP_ID, WINSTON } from '../scenes/fixtures';

// Real encrypted databases and queues: CI runners are about three times slower than a laptop.
configure({ asyncUtilTimeout: 15_000 });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export const CREW_ID = '0199a6f0-0000-7000-8000-00000000b001';
const DESTINATION = '0199a6f0-0000-7000-8000-00000000d001';
const GUIDE = '0199a6f0-0000-7000-8000-00000000d002';
const POLL = '0199a6f0-0000-7000-8000-00000000d003';

export function fakeSetupServices(
  answers: Readonly<Record<string, ApiRead>> = {},
): SetupServices & { readonly calls: string[]; readonly opened: string[] } {
  const calls: string[] = [];
  const opened: string[] = [];
  return {
    calls,
    opened,
    getJson: (path) => {
      calls.push(path);
      const key = Object.keys(answers).find((prefix) => path.startsWith(prefix));
      return Promise.resolve(key === undefined ? { kind: 'offline' } : (answers[key] as ApiRead));
    },
    openUrl: (url) => {
      opened.push(url);
      return Promise.resolve();
    },
    apiUrl: (path) => `https://api.test${path}`,
    now: () => SCENE_NOW,
  };
}

export function renderSetup(
  element: ReactElement,
  options: { readonly stack?: TestLocalFirst; readonly services?: SetupServices } = {},
) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const services = options.services ?? fakeSetupServices();
  const inner = (
    <SetupServicesProvider services={services}>
      <ScreenJoltProvider>{element}</ScreenJoltProvider>
    </SetupServicesProvider>
  );
  return render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          {options.stack === undefined ? (
            inner
          ) : (
            <LocalFirstProvider value={options.stack.value}>{inner}</LocalFirstProvider>
          )}
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

/** The Kyoto six as synced rows; `me` is the stack's uid standing in for one of them. */
export async function seedKyoto(
  stack: TestLocalFirst,
  options: { readonly as?: 'organiser' | 'member'; readonly step?: string } = {},
): Promise<{ readonly me: string }> {
  const { db, uid } = stack;
  const asOrganiser = (options.as ?? 'organiser') === 'organiser';
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    uid,
  ]);
  const people: [string, string][] = [
    [JORDAN, 'Jordan Lee'],
    [MAYA, 'Maya'],
    [ALEX, 'Alex'],
    [RIN, 'Rin'],
    [asOrganiser ? DEV : uid, 'Dev'],
    [asOrganiser ? uid : WINSTON, 'Winston'],
  ];
  await db.execute('INSERT INTO crews (id, name) VALUES (?, ?)', [CREW_ID, 'Kyoto crew']);
  await db.execute('INSERT INTO destinations (id, name, tz) VALUES (?, ?, ?)', [
    DESTINATION,
    'Kyoto',
    'Asia/Tokyo',
  ]);
  await db.execute('INSERT INTO guides (id, slug, name) VALUES (?, ?, ?)', [GUIDE, 'pon', 'Pon']);
  await db.execute(
    `INSERT INTO trips (id, crew_id, status, setup_step, destination_id, guide_id, tz,
       trip_length_days, local_currency, seat_cap, is_solo, created_at)
     VALUES (?, ?, 'setup', ?, ?, ?, 'Asia/Tokyo', 8, 'USD', 6, 0, '2026-09-01')`,
    [TRIP_ID, CREW_ID, options.step ?? 'when', DESTINATION, GUIDE],
  );
  for (const [index, [id, name]] of people.entries()) {
    await db.execute('INSERT INTO users (id, display_name) VALUES (?, ?)', [id, name]);
    await db.execute(
      `INSERT INTO crew_members (id, crew_id, user_id, status, created_at)
       VALUES (?, ?, ?, 'active', ?)`,
      [`cm-${index}`, CREW_ID, id, `2026-09-0${index + 1}T00:00:00Z`],
    );
    await db.execute(
      `INSERT INTO trip_participants (id, trip_id, user_id, role, rsvp, created_at)
       VALUES (?, ?, ?, ?, 'in', '2026-09-10')`,
      [`tp-${index}`, TRIP_ID, id, name === 'Winston' ? 'organiser' : 'member'],
    );
  }
  await db.execute(
    `INSERT INTO polls (id, crew_id, trip_id, kind, status) VALUES (?, ?, ?, 'destination', 'closed')`,
    [POLL, CREW_ID, TRIP_ID],
  );
  const ballots: [string, string][] = [
    [JORDAN, 'kyoto'],
    [MAYA, 'kyoto'],
    [ALEX, 'kyoto'],
    [RIN, 'kyoto'],
    [DEV, 'bali'],
    [WINSTON, 'bali'],
  ];
  for (const [index, [voter, option]] of ballots.entries()) {
    await db.execute('INSERT INTO ballots (id, poll_id, option_id, user_id) VALUES (?, ?, ?, ?)', [
      `b-${index}`,
      POLL,
      option,
      voter,
    ]);
  }
  return { me: uid };
}
