/**
 * Renders the recap page the way the app does (Lingui, safe area, gestures, the local-first stack)
 * over synced rows seeded straight into the local database: the Đà Nẵng trip of the fixtures, its
 * crew of four with the signed-in uid as the treasurer, Chà Vá's forms, and the recap row as the
 * worker writes it.
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

import type { AwardRow, RecapRow } from '../data/recap-rows';
import {
  ALEX,
  awardRows,
  CHAVA,
  CREW,
  DEST,
  FORM_ROWS,
  GUIDE,
  JORDAN,
  MAYA,
  RECAP,
  TRIP,
} from '../dev/recap-fixtures';

configure({ asyncUtilTimeout: 5000 });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export function renderRecap(ui: ReactElement, stack: TestLocalFirst) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  return render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <LocalFirstProvider value={stack.value}>
            <ScreenJoltProvider>{ui}</ScreenJoltProvider>
          </LocalFirstProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

/** Waits until `check` passes (15 s at most, for CI), letting live queries land each round. */
export async function until(check: () => boolean, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (check()) return;
    if (Date.now() > deadline) throw new Error('timed out waiting for the recap page');
  }
}

export interface SeedTrip {
  /** The viewer's rsvp; `out` for a traveller who dropped out. */
  readonly rsvp?: string;
  readonly solo?: boolean;
}

/** The finished trip, its crew and Chà Vá's forms, with the signed-in uid bound as the owner. */
export async function seedTrip(stack: TestLocalFirst, options: SeedTrip = {}): Promise<void> {
  const { db, uid } = stack;
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    uid,
  ]);
  await db.execute('INSERT INTO users (id, display_name) VALUES (?, ?), (?, ?), (?, ?), (?, ?)', [
    uid,
    'Winston',
    MAYA,
    'Maya',
    JORDAN,
    'Jordan',
    ALEX,
    'Alex',
  ]);
  await db.execute('INSERT INTO crews (id, name) VALUES (?, ?)', [CREW, 'The Đà Nẵng Four']);
  await db.execute(`INSERT INTO destinations (id, slug, name) VALUES (?, 'da-nang', 'Đà Nẵng')`, [
    DEST,
  ]);
  await db.execute(`INSERT INTO guides (id, slug, name) VALUES (?, 'chava', 'Chà Vá')`, [GUIDE]);
  await db.execute(
    `INSERT INTO trips (id, crew_id, status, destination_id, guide_id, is_solo, start_date, end_date)
     VALUES (?, ?, 'post_trip', ?, ?, ?, '2026-10-02', '2026-10-04')`,
    [TRIP, CREW, DEST, GUIDE, options.solo === true ? 1 : 0],
  );
  const travellers = options.solo === true ? [uid] : [uid, MAYA, JORDAN, ALEX];
  for (const member of travellers) {
    await db.execute(
      'INSERT INTO trip_participants (id, trip_id, user_id, rsvp) VALUES (?, ?, ?, ?)',
      [`tp-${member}`, TRIP, member, member === uid ? (options.rsvp ?? 'in') : 'in'],
    );
  }
  await db.execute(
    `INSERT INTO critters (id, key, no, city) VALUES (?, 'cp-151', 151, 'Đà Nẵng')`,
    [CHAVA],
  );
  for (const [index, form] of FORM_ROWS.entries()) {
    await db.execute(
      `INSERT INTO critter_forms (id, key, critter_id, rarity, edge, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [form.id, `form-${index}`, CHAVA, form.rarity, form.edge, `2026-01-0${index + 1}T00:00:00Z`],
    );
  }
}

/** Writes (or rewrites) the trip's recap row, as a sync of the worker's write would. */
export async function seedRecap(stack: TestLocalFirst, row: RecapRow): Promise<void> {
  await stack.db.execute(
    `INSERT OR REPLACE INTO recaps (id, trip_id, crew_id, status, version, stats, route, receipt,
       got_away, cards, changed_sections, failure_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      TRIP,
      CREW,
      row.status,
      row.version,
      row.stats,
      row.route,
      row.receipt,
      row.got_away,
      row.cards,
      row.changed_sections,
      row.failure_reason,
    ],
  );
}

export async function seedAwards(
  stack: TestLocalFirst,
  rows: readonly AwardRow[] = awardRows(stack.uid),
): Promise<void> {
  for (const row of rows) {
    await stack.db.execute(
      `INSERT INTO recap_awards (id, recap_id, trip_id, user_id, kind, metric, value, evidence,
         title, line, opted_out, is_mvp)
       VALUES (?, ?, ?, ?, ?, 'none', ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        RECAP,
        TRIP,
        row.user_id,
        row.kind,
        row.value,
        row.evidence,
        row.title,
        row.line,
        row.opted_out,
        row.is_mvp,
      ],
    );
  }
}
