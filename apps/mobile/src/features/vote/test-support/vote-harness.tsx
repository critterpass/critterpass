/**
 * Renders vote surfaces the way the app does (Lingui, safe area, gestures, the local-first stack)
 * over synced rows seeded straight into the local database: a crew of three (me, Maya, Jordan), a
 * few places and polls, with the signed-in uid bound as the database owner.
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

import { VoteServicesProvider, type VoteServices } from '../data/vote-services';
import { replayServices } from './replay-services';

configure({ asyncUtilTimeout: 5000 });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export const CREW = '0192f000-0000-7000-8000-00000000c1e0';
export const MAYA = '0192f000-0000-7000-8000-0000000000a1';
export const JORDAN = '0192f000-0000-7000-8000-0000000000b2';
export const TRIP = '0192f000-0000-7000-8000-0000000000f1';
export const POLL = '0192f000-0000-7000-8000-000000000501';
export const KYOTO = '0192f000-0000-7000-8000-0000000000d2';
export const LISBON = '0192f000-0000-7000-8000-0000000000d3';
export const BALI = '0192f000-0000-7000-8000-0000000000d1';

export function renderVote(
  ui: ReactElement,
  stack: TestLocalFirst,
  services: VoteServices = replayServices({}),
) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  return render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <LocalFirstProvider value={stack.value}>
            <VoteServicesProvider services={services}>
              <ScreenJoltProvider>{ui}</ScreenJoltProvider>
            </VoteServicesProvider>
          </LocalFirstProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

/** Waits until `check` passes (5 s at most), flushing the live queries' updates each round. */
export async function until(check: () => boolean, timeoutMs = 5000, label = ''): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (check()) return;
    if (Date.now() > deadline)
      throw new Error(`timed out waiting for the screen to settle ${label}`);
  }
}

/** Lets entrance motion finish before a layout snapshot. */
export function settleMotion(ms = 700): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Me, Maya and Jordan in one crew, with Kyoto, Lisbon and Bali in the catalogue. */
export async function seedCrew(stack: TestLocalFirst): Promise<void> {
  const { db, uid } = stack;
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    uid,
  ]);
  await db.execute('INSERT INTO users (id, display_name) VALUES (?, ?), (?, ?), (?, ?)', [
    uid,
    'Winston Tan',
    MAYA,
    'Maya',
    JORDAN,
    'Jordan',
  ]);
  await db.execute('INSERT INTO crews (id, name) VALUES (?, ?)', [CREW, 'The Bali Six']);
  for (const [index, member] of [uid, MAYA, JORDAN].entries()) {
    await db.execute(
      `INSERT INTO crew_members (id, crew_id, user_id, status, created_at)
       VALUES (?, ?, ?, 'active', ?)`,
      [`cm-${member}`, CREW, member, `2026-09-0${index + 1}T00:00:00Z`],
    );
  }
  await db.execute(
    `INSERT INTO destinations (id, slug, name, coverage) VALUES
       (?, 'kyoto', 'Kyoto', 'live'), (?, 'lisbon', 'Lisbon', 'live'), (?, 'bali', 'Bali', 'live')`,
    [KYOTO, LISBON, BALI],
  );
}

export interface SeedPoll {
  readonly id?: string;
  readonly kind?: 'generic' | 'destination';
  readonly stage?: 'board' | 'final' | null;
  readonly status?: 'open' | 'closed';
  readonly question?: string | null;
  readonly options: readonly { id: string; label: string; refId?: string | null }[];
  readonly ballots?: readonly { userId: string; optionId: string }[];
  readonly eligible?: readonly string[];
  readonly closesAt?: string | null;
  readonly winnerOptionId?: string | null;
  readonly result?: Record<string, unknown> | null;
  readonly createdBy?: string;
  readonly allowChange?: boolean;
}

export async function seedPoll(stack: TestLocalFirst, poll: SeedPoll): Promise<string> {
  const id = poll.id ?? POLL;
  await stack.db.execute(
    `INSERT INTO polls (id, crew_id, trip_id, kind, stage, status, question, created_by,
       eligible_voter_ids, closes_at, allow_change, winner_option_id, result, closed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-10-01T00:00:00Z')`,
    [
      id,
      CREW,
      poll.kind === 'destination' ? TRIP : null,
      poll.kind ?? 'generic',
      poll.stage ?? null,
      poll.status ?? 'open',
      poll.question === undefined ? 'Dinner tonight?' : poll.question,
      poll.createdBy ?? MAYA,
      JSON.stringify(poll.eligible ?? [stack.uid, MAYA, JORDAN]),
      poll.closesAt ?? null,
      poll.allowChange === false ? 0 : 1,
      poll.winnerOptionId ?? null,
      poll.result === undefined || poll.result === null ? null : JSON.stringify(poll.result),
      poll.status === 'closed' ? '2026-10-02T00:00:00Z' : null,
    ],
  );
  for (const [position, option] of poll.options.entries()) {
    await stack.db.execute(
      `INSERT INTO poll_options (id, poll_id, crew_id, kind, ref_id, label, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '2026-10-01T00:00:00Z')`,
      [
        option.id,
        id,
        CREW,
        poll.kind === 'destination' ? 'destination' : 'text',
        option.refId ?? null,
        option.label,
        position,
      ],
    );
  }
  for (const [i, ballot] of (poll.ballots ?? []).entries()) {
    await stack.db.execute(
      `INSERT INTO ballots (id, poll_id, option_id, crew_id, user_id, cast_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        `b-${id}-${ballot.userId}`,
        id,
        ballot.optionId,
        CREW,
        ballot.userId,
        `2026-10-01T0${i}:00:00Z`,
      ],
    );
  }
  return id;
}

/** Payloads of every queued op for `cmd`, in queue order. */
export async function queued(
  stack: TestLocalFirst,
  cmd: string,
): Promise<Record<string, unknown>[]> {
  const rows = await stack.db.getAll<{ envelope: string }>(
    'SELECT envelope FROM commands WHERE cmd = ? ORDER BY seq',
    [cmd],
  );
  return rows.map(
    (row) => (JSON.parse(row.envelope) as { payload: Record<string, unknown> }).payload,
  );
}
