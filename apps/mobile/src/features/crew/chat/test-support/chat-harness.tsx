/**
 * Renders chat screens the way the app does (Lingui, safe area, gestures, the jolt provider and the
 * local-first stack) over synced rows seeded straight into the local database, with the signed-in
 * uid bound as the database owner.
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

// The chat screens settle through several live queries on an encrypted database; CI runners are
// about three times slower than a laptop, so async queries wait up to 5 s instead of 1 s.
configure({ asyncUtilTimeout: 5000 });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export const CREW = '0192f000-0000-7000-8000-00000000c1e0';
export const MAYA = '0192f000-0000-7000-8000-0000000000a1';
export const LEO = '0192f000-0000-7000-8000-0000000000b2';
export const TOKEK = '0192f000-0000-7000-8000-0000000000e1';

export function renderChat(ui: ReactElement, stack: TestLocalFirst) {
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

/** The crew (me, Maya, Leo), a planning trip with Tokek as guide, and me bound as owner. */
export async function seedCrew(
  stack: TestLocalFirst,
  options: { readonly myStatus?: 'active' | 'former'; readonly lastReadSeq?: number } = {},
): Promise<void> {
  const { db, uid } = stack;
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    uid,
  ]);
  await db.execute('INSERT INTO crews (id, name) VALUES (?, ?)', [CREW, 'The Bali Six']);
  await db.execute('INSERT INTO users (id, display_name) VALUES (?, ?), (?, ?), (?, ?)', [
    uid,
    'Rin',
    MAYA,
    'Maya Tran',
    LEO,
    'Leo',
  ]);
  const members: [string, string, number][] = [
    [MAYA, 'active', 0],
    [uid, options.myStatus ?? 'active', options.lastReadSeq ?? 0],
    [LEO, 'active', 0],
  ];
  for (const [index, [member, status, read]] of members.entries()) {
    await db.execute(
      `INSERT INTO crew_members (id, crew_id, user_id, status, last_read_seq, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [`cm-${member}`, CREW, member, status, read, `2026-09-0${index + 1}T00:00:00Z`],
    );
  }
  await db.execute(
    "INSERT INTO guides (id, slug, name, colour) VALUES (?, 'tokek', 'Tokek', NULL)",
    [TOKEK],
  );
  await db.execute(
    "INSERT INTO trips (id, crew_id, status, phase, guide_id, created_at) VALUES ('t-1', ?, 'setup', 'planning', ?, '2026-09-01')",
    [CREW, TOKEK],
  );
}

let next = 0;

export interface SeedMessage {
  readonly seq: number;
  readonly sender: string | null;
  readonly body?: string;
  readonly type?: string;
  readonly kind?: 'user' | 'guide' | 'system';
  readonly refKind?: string;
  readonly refId?: string;
  readonly replyTo?: string;
  readonly attachments?: readonly object[];
  readonly createdAt?: string;
  readonly edited?: boolean;
  readonly deleted?: boolean;
}

export async function seedMessage(stack: TestLocalFirst, message: SeedMessage): Promise<string> {
  next += 1;
  const id = `0192f000-0000-7000-9000-${String(next).padStart(12, '0')}`;
  const kind = message.kind ?? (message.sender === null ? 'system' : 'user');
  await stack.db.execute(
    `INSERT INTO messages (id, crew_id, seq, sender_kind, sender_id, guide_id, type, body, ref_kind,
       ref_id, reply_to_id, mentions, mentions_guide, attachments, edited_at, deleted_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 0, ?, ?, ?, ?)`,
    [
      id,
      CREW,
      message.seq,
      kind,
      kind === 'user' ? message.sender : null,
      kind === 'guide' ? TOKEK : null,
      message.type ?? (kind === 'system' ? 'system' : 'text'),
      message.body ?? '',
      message.refKind ?? null,
      message.refId ?? null,
      message.replyTo ?? null,
      JSON.stringify(message.attachments ?? []),
      message.edited === true ? '2026-09-28T10:05:00Z' : null,
      message.deleted === true ? '2026-09-28T10:06:00Z' : null,
      message.createdAt ?? new Date().toISOString(),
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
