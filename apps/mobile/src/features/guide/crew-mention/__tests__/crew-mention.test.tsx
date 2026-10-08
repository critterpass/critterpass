/**
 * The guide in crew chat: the asker's app streams the reply to its own fresh @mention once (never
 * someone else's, never one already answered) until the saved reply syncs, a spent meter becomes
 * the hint, and an offer needs an explicit confirm before a slot is claimed.
 */

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { configure, fireEvent, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { tokens } from '@cp/design-tokens';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { renderWithI18n } from '@/lib/i18n/testing';

import type { GuideFrame } from '../../chat/data/guide-frames';
import { GuideServicesProvider, type GuideServices } from '../../chat/data/guide-services';
import { quotaRefusal } from '../../chat/test-support/replay-guide';
import { OfferCardView, offerState } from '../offer-card';
import { unansweredMentions, useCrewGuideStreams } from '../use-crew-guide-streams';

configure({ asyncUtilTimeout: 5000 });

const CREW = '0192f000-0000-7000-8000-00000000c1e0';
const MAYA = '0192f000-0000-7000-8000-0000000000a1';
const MENTION = '0192f000-0000-7000-8000-00000000d001';
const REPLY = '0192f000-0000-7000-8000-00000000d002';

/** `POST /v1/guide/crew/{crew_id}/mentions` for "@tokek can we catch sunset somewhere after?". */
const SUNSET: readonly GuideFrame[] = [
  { type: 'token', data: { text: 'Batu Bolong at 18:05. ' } },
  { type: 'token', data: { text: 'Twenty minutes from the spa.' } },
  { type: 'done', data: { ai_generated: true, sources: [] } },
];

const stacks: TestLocalFirst[] = [];
afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close().catch(() => undefined);
    removeDir(stack.dir);
  }
});

async function open(): Promise<TestLocalFirst> {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  await stack.db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    stack.uid,
  ]);
  return stack;
}

async function message(
  stack: TestLocalFirst,
  row: {
    id: string;
    seq: number;
    sender: string | null;
    kind: string;
    mentions?: boolean;
    replyTo?: string;
  },
) {
  await stack.db.execute(
    `INSERT INTO messages (id, crew_id, seq, sender_kind, sender_id, type, body, mentions_guide, reply_to_id, created_at)
     VALUES (?, ?, ?, ?, ?, 'text', 'x', ?, ?, ?)`,
    [
      row.id,
      CREW,
      row.seq,
      row.kind,
      row.sender,
      row.mentions === true ? 1 : 0,
      row.replyTo ?? null,
      new Date().toISOString(),
    ],
  );
}

function wrap(stack: TestLocalFirst, services: GuideServices) {
  return ({ children }: { children: ReactNode }) =>
    stack.wrapper({
      children: <GuideServicesProvider services={services}>{children}</GuideServicesProvider>,
    });
}

describe('which mentions the asker streams', () => {
  const now = Date.parse('2026-10-03T08:00:00Z');
  const row = (id: string, extra: Partial<Parameters<typeof unansweredMentions>[0][number]>) => ({
    id,
    sender_kind: 'user',
    sender_id: 'me',
    mentions_guide: 1,
    reply_to_id: null,
    created_at: '2026-10-03T07:59:30Z',
    ...extra,
  });

  it('keeps only fresh, unanswered mentions', () => {
    expect(
      unansweredMentions(
        [
          row('fresh', {}),
          row('old', { created_at: '2026-10-03T07:50:00Z' }),
          row('answered', {}),
          row('reply', { sender_kind: 'guide', reply_to_id: 'answered', mentions_guide: 0 }),
        ],
        now,
      ),
    ).toEqual(['fresh']);
  });
});

describe('the guide answering a mention', () => {
  it('streams my own mention once and gives way to the saved reply', async () => {
    const stack = await open();
    await message(stack, { id: MENTION, seq: 7, sender: stack.uid, kind: 'user', mentions: true });
    await message(stack, {
      id: '0192f000-0000-7000-8000-00000000d0aa',
      seq: 8,
      sender: MAYA,
      kind: 'user',
      mentions: true,
    });
    const calls: string[] = [];
    const services: GuideServices = {
      streamTurn: () => Promise.resolve(),
      streamMention: (crewId, messageId, onFrame) => {
        calls.push(`${crewId}/${messageId}`);
        for (const frame of SUNSET) onFrame(frame);
        return Promise.resolve();
      },
    };
    const { result } = await renderHook(() => useCrewGuideStreams(CREW), {
      wrapper: wrap(stack, services),
    });
    await waitFor(() =>
      expect(result.current.replies).toEqual([
        { key: MENTION, text: 'Batu Bolong at 18:05. Twenty minutes from the spa.' },
      ]),
    );
    expect(calls).toEqual([`${CREW}/${MENTION}`]);
    await message(stack, { id: REPLY, seq: 9, sender: null, kind: 'guide', replyTo: MENTION });
    await waitFor(() => expect(result.current.replies).toEqual([]));
    expect(calls).toHaveLength(1);
  });

  it('turns a spent meter into the hint', async () => {
    const stack = await open();
    const mention = '0192f000-0000-7000-8000-00000000d0bb';
    await message(stack, { id: mention, seq: 3, sender: stack.uid, kind: 'user', mentions: true });
    const services: GuideServices = {
      streamTurn: () => Promise.resolve(),
      streamMention: () => Promise.reject(quotaRefusal()),
    };
    const { result } = await renderHook(() => useCrewGuideStreams(CREW), {
      wrapper: wrap(stack, services),
    });
    await waitFor(() => expect(result.current.spent?.resetAt).toBe('2026-09-30T17:00:00.000Z'));
    expect(result.current.replies).toEqual([]);
  });
});

describe('a guide offer', () => {
  const base = {
    slots_total: 3,
    slots_taken: 2,
    status: 'open',
    expires_at: null,
    mine: 0,
    slug: 'tokek',
  };

  it('reads open, mine, full and expired', () => {
    const now = Date.parse('2026-10-03T08:00:00Z');
    expect(offerState(base, now)).toBe('open');
    expect(offerState({ ...base, mine: 1 }, now)).toBe('mine');
    expect(offerState({ ...base, slots_taken: 3 }, now)).toBe('full');
    expect(offerState({ ...base, expires_at: '2026-10-03T07:00:00Z' }, now)).toBe('expired');
  });

  it('claims a slot only after the explicit confirm', async () => {
    const onIn = jest.fn();
    const onConfirm = jest.fn();
    const view = (confirming: boolean) => (
      <GestureHandlerRootView>
        <OfferCardView
          text="Karsa Spa has three slots at 14:00. Tap in and I'll book it and split it."
          color={tokens.guide.tokek}
          state="open"
          slotsLeft={1}
          taken={2}
          total={3}
          confirming={confirming}
          onIn={onIn}
          onConfirm={onConfirm}
          onNotNow={() => undefined}
        />
      </GestureHandlerRootView>
    );
    const closed = await renderWithI18n(view(false));
    expect(screen.getByText("I'M IN · 1 SLOT LEFT")).toBeTruthy();
    await fireEvent.press(screen.getByTestId('guide-offer-in'));
    expect(onIn).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    await closed.unmount();
    await renderWithI18n(view(true));
    await fireEvent.press(screen.getByTestId('guide-offer-yes'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
