/**
 * Renders the must-dos step and the add sheet the way the app does (Lingui, safe area, gestures,
 * the local-first stack) over synced rows seeded into the local database: the Kyoto six with
 * Winston organising. The api is the network boundary (`SetupServices.getJson`).
 */
/* eslint-disable lingui/no-unlocalized-strings -- test support; literals are fixtures and SQL. */
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { configure, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import type { TestLocalFirst } from '@/data/powersync/test-support/local-first-fixture';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { SetupServicesProvider, type ApiRead, type SetupServices } from '../../data/services';
import { ALEX, DEV, JORDAN, MAYA, RIN, SCENE_NOW, TRIP_ID, WINSTON } from '../../scenes/fixtures';

configure({ asyncUtilTimeout: 5000 });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export const DESTINATION = '0199a6f0-0000-7000-8000-00000000d0c1';

export function services(answer: (path: string) => ApiRead = () => ({ kind: 'offline' })) {
  const paths: string[] = [];
  const value: SetupServices = {
    getJson: (path) => {
      paths.push(path);
      return Promise.resolve(answer(path));
    },
    openUrl: () => Promise.resolve(),
    apiUrl: (path) => `https://api.test${path}`,
    now: () => SCENE_NOW,
  };
  return { value, paths };
}

/** App chrome every setup view needs: Lingui (English), safe area, gestures, screen jolts. */
export function Chrome({ children }: { readonly children: ReactNode }) {
  return (
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <ScreenJoltProvider>{children}</ScreenJoltProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>
  );
}

export function renderPlain(node: ReactNode) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  return render(<Chrome>{node}</Chrome>);
}

export function renderWith(stack: TestLocalFirst, api: SetupServices, node: ReactNode) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  return render(
    <Chrome>
      <LocalFirstProvider value={stack.value}>
        <SetupServicesProvider services={api}>{node}</SetupServicesProvider>
      </LocalFirstProvider>
    </Chrome>,
  );
}

/** The Kyoto six on the must-dos step, the phone signed in as `stack.uid`. */
export async function seedKyoto(stack: TestLocalFirst, step = 'must_dos'): Promise<void> {
  const { db, uid } = stack;
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    uid,
  ]);
  await db.execute("INSERT INTO destinations (id, name, tz) VALUES (?, 'Kyoto', 'Asia/Tokyo')", [
    DESTINATION,
  ]);
  await db.execute("INSERT INTO guides (id, slug, name) VALUES ('g-pon', 'pon', 'Pon')");
  await db.execute('INSERT INTO crews (id, name) VALUES (?, ?)', ['crew-k', 'Kyoto six']);
  await db.execute(
    `INSERT INTO trips (id, crew_id, status, setup_step, destination_id, guide_id, start_date,
       end_date, tz) VALUES (?, 'crew-k', 'setup', ?, ?, 'g-pon', '2027-04-02', '2027-04-09',
       'Asia/Tokyo')`,
    [TRIP_ID, step, DESTINATION],
  );
  const people: [string, string][] = [
    [JORDAN, 'Jordan'],
    [MAYA, 'Maya'],
    [ALEX, 'Alex'],
    [RIN, 'Rin'],
    [DEV, 'Dev'],
    [WINSTON, 'Winston'],
  ];
  for (const [index, [id, name]] of people.entries()) {
    await db.execute('INSERT INTO users (id, display_name) VALUES (?, ?)', [id, name]);
    await db.execute(
      "INSERT INTO crew_members (id, crew_id, user_id, status, created_at) VALUES (?, 'crew-k', ?, 'active', ?)",
      [`cm-${id}`, id, `2026-09-0${index + 1}T00:00:00Z`],
    );
    await db.execute(
      "INSERT INTO trip_participants (id, trip_id, user_id, role, rsvp) VALUES (?, ?, ?, ?, 'in')",
      [`tp-${id}`, TRIP_ID, id, id === WINSTON ? 'organiser' : 'member'],
    );
  }
}

export async function seedMustDo(
  stack: TestLocalFirst,
  row: {
    readonly id: string;
    readonly owner: string;
    readonly title: string;
    readonly fit?: string;
    readonly action?: string;
    readonly deadline?: string | null;
  },
): Promise<void> {
  await stack.db.execute(
    `INSERT OR REPLACE INTO must_dos (id, trip_id, owner_id, title, priority, fit_status,
       external_action, external_deadline, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    [
      row.id,
      TRIP_ID,
      row.owner,
      row.title,
      row.fit ?? 'unknown',
      row.action ?? 'none',
      row.deadline ?? null,
      '2026-10-01T00:00:00Z',
    ],
  );
}
