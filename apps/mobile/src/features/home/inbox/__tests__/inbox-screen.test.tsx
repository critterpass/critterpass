/**
 * The inbox over the real local-first stack: needs-you cards above the EARLIER list, an answer that
 * queues `act_inbox_item` and leaves at once, the count ticking down to Tokek asleep, a refused
 * answer coming back with a toast, an item settled on another surface leaving live, UNDO rows,
 * mark-all-read that never resolves, and the Crew and Guides filters.
 */
// The store SDK is a native boundary the inbox never calls here.
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {} }));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, within } from '@testing-library/react-native';

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
import { InboxPremiumScreen } from '../../premium/inbox/inbox-premium-screen';

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
    await renderHome(<InboxPremiumScreen />, s);
    await until(() => screen.queryByTestId(`inbox-card-${nudge}`) !== null);
    expect(screen.getByText('Needs you · 1')).toBeTruthy();
    expect(screen.getByText(/^Maya nudged you$/i)).toBeTruthy();
    expect(screen.getByText('The crew is waiting on your vote.')).toBeTruthy();
    expect(screen.getByText('Jordan joined The Bali Six')).toBeTruthy();
    expect(screen.getByText("Tokek moved Rin's pickup to 22:40")).toBeTruthy();
    expect(screen.getByText(/^undo$/i)).toBeTruthy();
  });

  it('queues the answer, lets the card go and settles on Tokek asleep', async () => {
    const s = await open();
    const nudge = await seedNudge(s);
    await renderHome(<InboxPremiumScreen />, s);
    await until(() => screen.queryByTestId(`inbox-action-${nudge}-open`) !== null);
    await fireEvent.press(screen.getByTestId(`inbox-action-${nudge}-open`));
    await until(() => screen.queryByText('Needs you · 0') !== null);
    expect(await queued(s, 'act_inbox_item')).toEqual([{ item_id: nudge, action: 'open' }]);
    await until(() => screen.queryByText('Needs you · 0') !== null);
    await until(() => screen.queryByTestId('inbox-caught-up') !== null);
    expect(screen.queryByTestId(`inbox-card-${nudge}`)).toBeNull();
  });

  it('brings a refused answer back with a toast', async () => {
    const s = await open();
    const nudge = await seedNudge(s);
    await renderHome(<InboxPremiumScreen />, s);
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
    await renderHome(<InboxPremiumScreen />, s);
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
    await renderHome(<InboxPremiumScreen />, s);
    await until(() => screen.queryByTestId(`inbox-undo-${moved}`) !== null);
    // UNDO is its own button beside the row's, never inside it: iOS folds a button's children
    // into one element, which left UNDO out of reach of VoiceOver.
    expect(
      within(screen.getByTestId(`inbox-row-${moved}`)).queryByTestId(`inbox-undo-${moved}`),
    ).toBeNull();
    await fireEvent.press(screen.getByTestId(`inbox-undo-${moved}`));
    await until(() => toastQueue.getCurrent() !== null);
    expect(await queued(s, 'act_inbox_item')).toEqual([{ item_id: moved, action: 'undo' }]);
    toastQueue.dismiss();
    await fireEvent.press(screen.getByLabelText('Mark all read'));
    await until(() => toastQueue.getCurrent() !== null);
    expect(await queued(s, 'mark_inbox_read')).toEqual([{ all: true }]);
  });

  it('marks what is unread, and offers mark-all-read only while something is', async () => {
    const s = await open();
    const { joined, moved } = await seedEarlier(s);
    await renderHome(<InboxPremiumScreen />, s);
    await until(() => screen.queryByTestId(`inbox-unread-${joined}`) !== null);
    expect(screen.getByLabelText('Mark all read')).toBeTruthy();
    // Neither row has anywhere to go: plain lines, not buttons that do nothing.
    expect(screen.getByTestId(`inbox-row-${joined}`).props.accessibilityRole).toBeUndefined();

    await s.db.execute("UPDATE inbox_items SET read_at = '2026-09-28T10:00:00Z'");
    await until(() => screen.queryByTestId(`inbox-unread-${joined}`) === null);
    expect(screen.queryByTestId(`inbox-unread-${moved}`)).toBeNull();
    expect(screen.queryByLabelText('Mark all read')).toBeNull();
  });

  it('filters to the crew and to the guides', async () => {
    const s = await open();
    await seedNudge(s);
    const { joined, moved } = await seedEarlier(s);
    await renderHome(<InboxPremiumScreen />, s);
    await until(() => screen.queryByTestId(`inbox-row-${joined}`) !== null);
    await fireEvent.press(screen.getByText('Guides'));
    await until(() => screen.queryByTestId(`inbox-row-${joined}`) === null);
    expect(screen.getByTestId(`inbox-row-${moved}`)).toBeTruthy();
    await fireEvent.press(screen.getByText('Crew'));
    await until(() => screen.queryByTestId(`inbox-row-${joined}`) !== null);
    expect(screen.queryByTestId(`inbox-row-${moved}`)).toBeNull();
  });
});
