/**
 * Renders the budget step the way the app does (Lingui, safe area, gestures, the local-first
 * stack, the setup services) over synced rows seeded into the local database. The api is the
 * network boundary: reads answer with bodies shaped like the server's routes.
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

import { SetupServicesProvider, type ApiRead, type SetupServices } from '../../data/services';
import { kyotoTrip, sceneFrame, SCENE_NOW, TRIP_ID } from '../../scenes/fixtures';
import { BudgetStep } from '../budget-step';

configure({ asyncUtilTimeout: 5000 });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export function apiReads(answers: Readonly<Record<string, ApiRead>>): SetupServices & {
  readonly paths: string[];
} {
  const paths: string[] = [];
  return {
    paths,
    getJson: (path) => {
      paths.push(path);
      const key = Object.keys(answers).find((prefix) => path.startsWith(prefix));
      return Promise.resolve(
        key === undefined
          ? { kind: 'error', status: 404, code: 'NOT_FOUND' }
          : (answers[key] ?? { kind: 'offline' }),
      );
    },
    openUrl: () => Promise.resolve(),
    apiUrl: (path) => `https://api.test${path}`,
    now: () => SCENE_NOW,
  };
}

export const K_ANON: ApiRead = { kind: 'error', status: 409, code: 'K_ANON_UNAVAILABLE' };

/**
 * The trip, its crew (settling in USD unless `currency` says otherwise), `people` taking part,
 * the crew-level row when there is one, and the day's synced rates as `[base, quote, rate]`.
 */
export async function seedBudget(
  stack: TestLocalFirst,
  options: {
    readonly people: readonly (readonly [string, string])[];
    readonly aggregate: Readonly<Record<string, unknown>> | null;
    readonly currency?: string;
    readonly fx?: readonly (readonly [base: string, quote: string, rate: string])[];
  },
): Promise<void> {
  const { db } = stack;
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    stack.uid,
  ]);
  await db.execute('INSERT INTO crews (id, name, settlement_currency) VALUES (?, ?, ?)', [
    'crew-1',
    'Kyoto Six',
    options.currency ?? 'USD',
  ]);
  for (const [base, quote, rate] of options.fx ?? []) {
    await db.execute(
      `INSERT INTO fx_snapshots (id, base, quote, rate, as_of, source)
       VALUES (?, ?, ?, ?, '2027-03-01', 'frankfurter')`,
      [`fx-${base}-${quote}`, base, quote, rate],
    );
  }
  await db.execute(
    `INSERT INTO trips (id, crew_id, status, setup_step, start_date, end_date, tz)
     VALUES (?, 'crew-1', 'setup', 'budget', '2027-04-02', '2027-04-09', 'Asia/Tokyo')`,
    [TRIP_ID],
  );
  for (const [uid, name] of options.people) {
    await db.execute('INSERT INTO users (id, display_name, home_currency) VALUES (?, ?, ?)', [
      uid,
      name,
      'USD',
    ]);
    await db.execute(
      `INSERT INTO trip_participants (id, trip_id, user_id, role, rsvp) VALUES (?, ?, ?, 'member', 'in')`,
      [`tp-${uid}`, TRIP_ID, uid],
    );
  }
  if (options.aggregate === null) return;
  const columns = Object.keys(options.aggregate);
  await db.execute(
    `INSERT INTO trip_budget_aggregates (id, trip_id, ${columns.join(', ')})
     VALUES (?, ?, ${columns.map(() => '?').join(', ')})`,
    [TRIP_ID, TRIP_ID, ...Object.values(options.aggregate)],
  );
}

export function renderBudget(
  stack: TestLocalFirst,
  services: SetupServices,
  options: { readonly organiser: boolean },
) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const base = kyotoTrip({ step: 'budget', dates: true, me: stack.uid });
  const trip = { ...base, isOrganiser: options.organiser };
  return render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <LocalFirstProvider value={stack.value}>
            <SetupServicesProvider services={services}>
              <ScreenJoltProvider>
                <BudgetStep trip={trip} shell={sceneFrame(trip, 'budget')} />
              </ScreenJoltProvider>
            </SetupServicesProvider>
          </LocalFirstProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}
