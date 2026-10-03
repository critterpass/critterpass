/**
 * The proposal's card in crew chat on the real local-first stack: a `proposal` message carries no
 * body, so the card draws from the proposal it points at and the message's trip, and holds a
 * placeholder until both have synced.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import type { ChatMessage } from '@/features/crew';
import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { ProposalMessageCard } from '../chat-card';
import { proposalRoutes } from '../routes';

const CREW = '0192f000-0000-7000-8000-00000000c1e0';
const MAYA = '0192f000-0000-7000-8000-0000000000a1';
const PROPOSAL = '0192f000-0000-7000-8000-0000000fa001';
const MESSAGE = '0192f000-0000-7000-9000-000000000001';

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

/** The founder's shape: a `proposal` message with an empty body, its trip on the row. */
const message: ChatMessage = {
  id: MESSAGE,
  crewId: CREW,
  seq: 1,
  senderKind: 'user',
  senderId: MAYA,
  senderName: 'Maya',
  guideId: null,
  type: 'proposal',
  body: '',
  refKind: 'proposal',
  refId: PROPOSAL,
  replyToId: null,
  mentions: [],
  mentionsGuide: false,
  attachments: [],
  edited: false,
  deleted: false,
  createdAt: '2026-10-01T10:00:00Z',
  status: 'sent',
};

async function seed(s: TestLocalFirst, withProposal: boolean) {
  await s.db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    s.uid,
  ]);
  await s.db.execute('INSERT INTO users (id, display_name) VALUES (?, ?), (?, ?)', [
    s.uid,
    'Rin',
    MAYA,
    'Maya',
  ]);
  for (const [index, member] of [MAYA, s.uid].entries()) {
    await s.db.execute(
      `INSERT INTO crew_members (id, crew_id, user_id, status, created_at)
       VALUES (?, ?, ?, 'active', ?)`,
      [`cm-${index}`, CREW, member, `2026-09-0${index + 1}T00:00:00Z`],
    );
  }
  await s.db.execute(
    "INSERT INTO trip_participants (id, trip_id, user_id, role) VALUES ('tp-1', 't-1', ?, 'organiser')",
    [MAYA],
  );
  await s.db.execute(
    "INSERT INTO destinations (id, name, slug) VALUES ('d-1', 'Đà Nẵng', 'da-nang')",
  );
  await s.db.execute(
    "INSERT INTO trips (id, crew_id, status, destination_id, created_at) VALUES ('t-1', ?, 'proposed', 'd-1', '2026-09-01')",
    [CREW],
  );
  await s.db.execute(
    `INSERT INTO messages (id, crew_id, trip_id, seq, sender_kind, sender_id, type, body, ref_kind,
       ref_id, created_at)
     VALUES (?, ?, 't-1', 1, 'user', ?, 'proposal', '', 'proposal', ?, '2026-10-01T10:00:00Z')`,
    [MESSAGE, CREW, MAYA, PROPOSAL],
  );
  if (withProposal) await seedProposal(s);
}

function seedProposal(s: TestLocalFirst) {
  return s.db.execute(
    `INSERT INTO proposals (id, trip_id, status, format, created_at)
     VALUES (?, 't-1', 'sent', 'trailer', '2026-10-01T10:00:00Z')`,
    [PROPOSAL],
  );
}

function renderCard(s: TestLocalFirst) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  return render(
    <I18nProvider i18n={i18n}>
      <GestureHandlerRootView>
        <LocalFirstProvider value={s.value}>
          <ProposalMessageCard message={message} mine={false} />
        </LocalFirstProvider>
      </GestureHandlerRootView>
    </I18nProvider>,
  );
}

describe('proposal card in crew chat', () => {
  it('draws the proposal from its row and the trip, and opens the trailer for a member', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seed(stack, true);
    await renderCard(stack);
    expect(await screen.findByText(/^Đà Nẵng: the proposal$/iu)).toBeTruthy();
    expect(screen.getByText('Your version is ready. Are you in?')).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`proposal-card-open-${PROPOSAL}`));
    expect(router.push).toHaveBeenCalledWith(proposalRoutes.trailer(PROPOSAL));
  });

  it('holds a placeholder until the proposal syncs, then draws it', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seed(stack, false);
    await renderCard(stack);
    expect(await screen.findByLabelText('Loading the proposal')).toBeTruthy();
    await seedProposal(stack);
    expect(await screen.findByText(/^Đà Nẵng: the proposal$/iu)).toBeTruthy();
  });
});
