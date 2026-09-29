/**
 * The inbox over the real local-first stack: needs-you cards above the EARLIER list, an answer that
 * queues `act_inbox_item` and leaves at once, the count ticking down to Tokek asleep, a refused
 * answer coming back with a toast, an item settled on another surface leaving live, UNDO rows,
 * mark-all-read that never resolves, the CREW and GUIDES filters, and Tokek opening one eye.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
// Cross-fades are timing, not layout: snapshots see their settled content.
jest.mock('../../fade-in-view', () => ({
  FadeInView: ({ children }: { children: unknown }) => children,
}));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { toastQueue } from '@/motion/island-toast';

import {
  JORDAN,
  MAYA,
  queued,
  renderHome,
  seedCrew,
  seedInboxItem,
  until,
} from '../../test-support/home-harness';
import { InboxScreen } from '../inbox-screen';

const HOUR = 3_600_000;
let stack: TestLocalFirst | null = null;

async function open(): Promise<TestLocalFirst> {
  stack = await openTestLocalFirst({ holdUploads: true });
  await seedCrew(stack);
  return stack;
}

afterEach(async () => {
  toastQueue.dismiss();
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

const OPEN = [{ id: 'open', style: 'primary' }];

async function seedNudge(s: TestLocalFirst): Promise<string> {
  return seedInboxItem(s, {
    kind: 'nudge.received',
    needsYou: true,
    actorId: MAYA,
    data: { reason: 'vote', guide: 'tokek' },
    actions: OPEN,
    expiresAt: new Date(Date.now() + 48 * HOUR).toISOString(),
  });
}

async function seedEarlier(s: TestLocalFirst): Promise<{ joined: string; moved: string }> {
  const joined = await seedInboxItem(s, {
    kind: 'crew.member_joined',
    actorId: JORDAN,
    createdAt: new Date(Date.now() - 2 * HOUR).toISOString(),
  });
  const moved = await seedInboxItem(s, {
    kind: 'guide_action.executed',
    source: 'guide',
    data: { summary: "moved Rin's pickup to 22:40", guide: 'tokek', action_id: 'a-1' },
    actions: [{ id: 'undo', style: 'undo', command: 'undo_guide_action' }],
    undoUntil: new Date(Date.now() + HOUR).toISOString(),
    createdAt: new Date(Date.now() - 3 * HOUR).toISOString(),
  });
  return { joined, moved };
}

describe('inbox', () => {
  it('shows the needs-you card above the quiet EARLIER list', async () => {
    const s = await open();
    const nudge = await seedNudge(s);
    await seedEarlier(s);
    await renderHome(<InboxScreen />, s);
    await until(() => screen.queryByTestId(`inbox-card-${nudge}`) !== null);
    expect(screen.getByText('NEEDS YOU · 1')).toBeTruthy();
    expect(screen.getByText('MAYA NUDGED YOU')).toBeTruthy();
    expect(screen.getByText('The crew is waiting on your vote.')).toBeTruthy();
    expect(screen.getByText('Jordan joined The Bali Six')).toBeTruthy();
    expect(screen.getByText("Tokek moved Rin's pickup to 22:40")).toBeTruthy();
    expect(screen.getByText('UNDO')).toBeTruthy();
  });

  it('goes back to Home, or opens Home when the inbox was opened cold', async () => {
    const s = await open();
    await renderHome(<InboxScreen />, s);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.back).toHaveBeenCalledTimes(1);
    jest.mocked(router.canGoBack).mockReturnValueOnce(false);
    await fireEvent.press(screen.getByTestId('inbox-back'));
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('queues the answer, lets the card go and settles on Tokek asleep', async () => {
    const s = await open();
    const nudge = await seedNudge(s);
    await renderHome(<InboxScreen />, s);
    await until(() => screen.queryByTestId(`inbox-action-${nudge}-open`) !== null);
    await fireEvent.press(screen.getByTestId(`inbox-action-${nudge}-open`));
    await until(() => screen.queryByText('NEEDS YOU · 0') !== null);
    expect(await queued(s, 'act_inbox_item')).toEqual([{ item_id: nudge, action: 'open' }]);
    await until(() => screen.queryByText('NEEDS YOU · 0') !== null);
    await until(() => screen.queryByTestId('inbox-caught-up') !== null);
    expect(screen.queryByTestId(`inbox-card-${nudge}`)).toBeNull();
  });

  it('brings a refused answer back with a toast', async () => {
    const s = await open();
    const nudge = await seedNudge(s);
    await renderHome(<InboxScreen />, s);
    await until(() => screen.queryByTestId(`inbox-action-${nudge}-open`) !== null);
    await fireEvent.press(screen.getByTestId(`inbox-action-${nudge}-open`));
    await until(() => screen.queryByTestId('inbox-caught-up') !== null);
    const [op] = await s.db.getAll<{ id: string }>(
      "SELECT id FROM commands WHERE cmd = 'act_inbox_item'",
    );
    await s.db.writeTransaction(async (tx) => {
      await tx.execute('DELETE FROM commands WHERE id = ?', [op!.id]);
      await tx.execute(
        `INSERT INTO rejected_commands (id, cmd, code, detail, summary, rejected_at)
         VALUES (?, 'act_inbox_item', 'STATE_INVALID', '{"state":"expired"}', NULL, ?)`,
        [op!.id, new Date().toISOString()],
      );
    });
    await until(() => screen.queryByTestId(`inbox-card-${nudge}`) !== null);
    await until(() => toastQueue.getCurrent()?.id === op!.id);
    expect(toastQueue.getCurrent()?.title).toBe("That didn't go through");
  });

  it('drops an item settled on another surface and shows the first-ever empty state', async () => {
    const s = await open();
    const nudge = await seedNudge(s);
    await renderHome(<InboxScreen />, s);
    await until(() => screen.queryByTestId(`inbox-card-${nudge}`) !== null);
    await s.db.execute('UPDATE inbox_items SET resolved_at = ? WHERE id = ?', [
      new Date().toISOString(),
      nudge,
    ]);
    await until(() => screen.queryByTestId(`inbox-card-${nudge}`) === null);
    await until(() => screen.queryByTestId('inbox-caught-up') !== null);
  });

  it('queues UNDO and mark-all-read, which never resolves', async () => {
    const s = await open();
    await seedNudge(s);
    const { moved } = await seedEarlier(s);
    await renderHome(<InboxScreen />, s);
    await until(() => screen.queryByTestId(`inbox-undo-${moved}`) !== null);
    await fireEvent.press(screen.getByTestId(`inbox-undo-${moved}`));
    await until(() => toastQueue.getCurrent() !== null);
    expect(await queued(s, 'act_inbox_item')).toEqual([{ item_id: moved, action: 'undo' }]);
    toastQueue.dismiss();
    await fireEvent.press(screen.getByTestId('inbox-mark-all-read'));
    await until(() => toastQueue.getCurrent() !== null);
    expect(await queued(s, 'mark_inbox_read')).toEqual([{ all: true }]);
  });

  it('filters to the crew and to the guides', async () => {
    const s = await open();
    await seedNudge(s);
    const { joined, moved } = await seedEarlier(s);
    await renderHome(<InboxScreen />, s);
    await until(() => screen.queryByTestId(`inbox-row-${joined}`) !== null);
    await fireEvent.press(screen.getByText('GUIDES'));
    await until(() => screen.queryByTestId(`inbox-row-${joined}`) === null);
    expect(screen.getByTestId(`inbox-row-${moved}`)).toBeTruthy();
    await fireEvent.press(screen.getByText('CREW'));
    await until(() => screen.queryByTestId(`inbox-row-${joined}`) !== null);
    expect(screen.queryByTestId(`inbox-row-${moved}`)).toBeNull();
  });

  it('opens one eye when Tokek is tapped', async () => {
    const s = await open();
    await renderHome(<InboxScreen />, s);
    await until(() => screen.queryByTestId('inbox-tokek') !== null);
    await fireEvent.press(screen.getByTestId('inbox-tokek'));
    expect(toastQueue.getCurrent()?.title).toBe('Nothing needs you yet. Back to sleep.');
  });
});
