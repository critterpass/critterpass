/**
 * Renders Home and Inbox the way the app does (Lingui, safe area, gestures, the jolt provider and
 * the local-first stack) over synced rows seeded straight into the local database, with the
 * signed-in uid bound as the database owner.
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

configure({ asyncUtilTimeout: 5000 });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export const CREW = '0192f000-0000-7000-8000-00000000c1e0';
export const MAYA = '0192f000-0000-7000-8000-0000000000a1';
export const JORDAN = '0192f000-0000-7000-8000-0000000000b2';
export const TOKEK = '0192f000-0000-7000-8000-0000000000e1';
export const BALI = '0192f000-0000-7000-8000-0000000000d1';
export const KYOTO = '0192f000-0000-7000-8000-0000000000d2';
export const TRIP = '0192f000-0000-7000-8000-0000000000f1';

export function renderHome(ui: ReactElement, stack: TestLocalFirst) {
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

/**
 * Waits until `check` passes (5 s at most). Home settles through a dozen live queries on the
 * encrypted database whose results land after render's act has closed; each round flushes the
 * updates they scheduled in a short act of its own, so no poll sits in one long act scope that
 * holds them back.
 */
export async function until(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (check()) return;
    if (Date.now() > deadline) throw new Error('timed out waiting for the screen to settle');
  }
}

/** Lets entrance fades and slides finish before a layout snapshot (they run on real timers). */
export function settleMotion(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 700));
}

/** Me (Winston) bound as the owner, with my own user row synced. */
export async function seedMe(stack: TestLocalFirst): Promise<void> {
  await stack.db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    stack.uid,
  ]);
  await stack.db.execute('INSERT INTO users (id, display_name) VALUES (?, ?)', [
    stack.uid,
    'Winston Tan',
  ]);
}

/** The Bali Six: me, Maya and Jordan, with Tokek and the Bali and Kyoto places in the catalogue. */
export async function seedCrew(stack: TestLocalFirst): Promise<void> {
  const { db, uid } = stack;
  await seedMe(stack);
  await db.execute('INSERT INTO crews (id, name) VALUES (?, ?)', [CREW, 'The Bali Six']);
  await db.execute('INSERT INTO users (id, display_name) VALUES (?, ?), (?, ?)', [
    MAYA,
    'Maya',
    JORDAN,
    'Jordan',
  ]);
  for (const [index, member] of [uid, MAYA, JORDAN].entries()) {
    await db.execute(
      `INSERT INTO crew_members (id, crew_id, user_id, status, created_at)
       VALUES (?, ?, ?, 'active', ?)`,
      [`cm-${member}`, CREW, member, `2026-09-0${index + 1}T00:00:00Z`],
    );
  }
  await db.execute(
    "INSERT INTO guides (id, slug, name, colour) VALUES (?, 'tokek', 'Tokek', NULL)",
    [TOKEK],
  );
  await db.execute(
    "INSERT INTO destinations (id, slug, name, tz) VALUES (?, 'bali', 'Bali', 'Asia/Makassar'), (?, 'kyoto', 'Kyoto', 'Asia/Tokyo')",
    [BALI, KYOTO],
  );
}

export interface SeedTrip {
  readonly status: string;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly countdownTargetAt?: string | null;
  readonly planProgress?: number;
}

export async function seedTrip(stack: TestLocalFirst, trip: SeedTrip): Promise<void> {
  await stack.db.execute(
    `INSERT INTO trips (id, crew_id, status, destination_id, guide_id, start_date, end_date, tz,
       plan_progress, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Asia/Makassar', ?, '2026-09-01')`,
    [
      TRIP,
      CREW,
      trip.status,
      BALI,
      TOKEK,
      trip.startDate ?? null,
      trip.endDate ?? null,
      trip.planProgress ?? 80,
    ],
  );
  await stack.db.execute(
    `INSERT INTO trip_participants (id, trip_id, user_id, rsvp, countdown_target_at)
     VALUES (?, ?, ?, 'in', ?)`,
    [`tp-${stack.uid}`, TRIP, stack.uid, trip.countdownTargetAt ?? null],
  );
}

let next = 0;

export interface SeedInboxItem {
  readonly kind: string;
  readonly needsYou?: boolean;
  readonly source?: 'crew' | 'guide' | 'system';
  readonly actorId?: string | null;
  readonly data?: Record<string, unknown>;
  readonly actions?: readonly Record<string, unknown>[];
  readonly createdAt?: string;
  readonly undoUntil?: string | null;
  readonly expiresAt?: string | null;
  readonly readAt?: string | null;
}

export async function seedInboxItem(stack: TestLocalFirst, item: SeedInboxItem): Promise<string> {
  next += 1;
  const id = `0192f000-0000-7000-9000-${String(next).padStart(12, '0')}`;
  await stack.db.execute(
    `INSERT INTO inbox_items (id, user_id, crew_id, trip_id, kind, source, actor_id, data, needs_you,
       actions, undo_until, expires_at, read_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      stack.uid,
      CREW,
      TRIP,
      item.kind,
      item.source ?? 'crew',
      item.actorId ?? null,
      JSON.stringify(item.data ?? {}),
      item.needsYou === true ? 1 : 0,
      JSON.stringify(item.actions ?? []),
      item.undoUntil ?? null,
      item.expiresAt ?? null,
      item.readAt ?? null,
      item.createdAt ?? new Date().toISOString(),
    ],
  );
  return id;
}

/** Payloads of every queued op for `cmd`, in queue order. */
export async function queued(stack: TestLocalFirst, cmd: string): Promise<unknown[]> {
  const rows = await stack.db.getAll<{ envelope: string }>(
    'SELECT envelope FROM commands WHERE cmd = ? ORDER BY seq',
    [cmd],
  );
  return rows.map((row) => (JSON.parse(row.envelope) as { payload: unknown }).payload);
}
