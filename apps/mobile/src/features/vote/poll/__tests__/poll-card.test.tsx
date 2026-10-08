/**
 * The chat poll card over the real local-first stack: a vote cast offline shows at once from the
 * queue and counts once when the server's ballot syncs (never twice); changing the vote moves it;
 * a poll that forbids changes keeps the first answer; a closed poll shows its result; the new-poll
 * sheet queues `create_poll` only for a postable draft.
 */

import { afterEach, describe, expect, it, type jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { ChatPollCard } from '../chat-poll-card';
import { CreatePollSheet, postableOptions, postBlocker } from '../create-poll-sheet';
import {
  CREW,
  JORDAN,
  MAYA,
  POLL,
  queued,
  renderVote,
  seedCrew,
  seedPoll,
  until,
} from '../../test-support/vote-harness';

const TACOS = '0192f000-0000-7000-8000-000000000601';
const RAMEN = '0192f000-0000-7000-8000-000000000602';
let stack: TestLocalFirst | null = null;

async function open(): Promise<TestLocalFirst> {
  stack = await openTestLocalFirst({ holdUploads: true });
  await seedCrew(stack);
  return stack;
}

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

const message = {
  id: 'm-1',
  crewId: CREW,
  seq: 4,
  senderKind: 'user',
  senderId: MAYA,
  senderName: 'Maya',
  guideId: null,
  type: 'poll',
  body: 'Dinner tonight?',
  refKind: 'poll',
  refId: POLL,
  replyToId: null,
  mentions: [],
  mentionsGuide: false,
  attachments: [],
  editedAt: null,
  deletedAt: null,
  createdAt: '2026-10-01T00:00:00Z',
  status: 'sent',
} as never;

function count(index: number): string {
  const row = screen.getByTestId(`poll-option-${index}`);
  return String(row.props.accessibilityLabel);
}

describe('chat poll card', () => {
  it('counts an offline vote at once and once only after it syncs', async () => {
    const s = await open();
    await seedPoll(s, {
      options: [
        { id: TACOS, label: 'Tacos' },
        { id: RAMEN, label: 'Ramen' },
      ],
      ballots: [{ userId: MAYA, optionId: TACOS }],
    });
    await renderVote(<ChatPollCard message={message} mine={false} />, s);
    await until(() => screen.queryByTestId('poll-option-1') !== null);
    expect(screen.getByText("Maya's poll")).toBeTruthy();
    expect(count(0)).toContain('1 votes');

    await fireEvent.press(screen.getByTestId('poll-option-0'));
    await until(() => count(0).includes('2 votes'));
    expect(count(0)).toContain('your vote');
    expect(await queued(s, 'cast_ballot')).toEqual([{ poll_id: POLL, option_id: TACOS }]);

    // The server's ballot syncs and the queue entry settles: still two votes, not three.
    await s.db.execute(
      `INSERT INTO ballots (id, poll_id, option_id, crew_id, user_id, cast_at)
       VALUES ('b-me', ?, ?, ?, ?, '2026-10-01T05:00:00Z')`,
      [POLL, TACOS, CREW, s.uid],
    );
    await s.db.execute("DELETE FROM commands WHERE cmd = 'cast_ballot'");
    await until(() => count(0).includes('2 votes') && count(0).includes('your vote'));
  });

  it('moves a changed vote, and keeps the first answer where changes are off', async () => {
    const s = await open();
    await seedPoll(s, {
      options: [
        { id: TACOS, label: 'Tacos' },
        { id: RAMEN, label: 'Ramen' },
      ],
      ballots: [{ userId: s.uid, optionId: TACOS }],
    });
    await renderVote(<ChatPollCard message={message} mine={false} />, s);
    await until(() => screen.queryByTestId('poll-option-1') !== null);
    await fireEvent.press(screen.getByTestId('poll-option-1'));
    await until(() => count(1).includes('your vote'));
    expect(count(0)).toContain('0 votes');

    await s.db.execute('DELETE FROM commands');
    await s.db.execute('UPDATE polls SET allow_change = 0');
    await until(() => count(0).includes('your vote'));
    await fireEvent.press(screen.getByTestId('poll-option-1'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await queued(s, 'cast_ballot')).toEqual([]);
  });

  it('shows the result once the poll closes', async () => {
    const s = await open();
    await seedPoll(s, {
      status: 'closed',
      winnerOptionId: RAMEN,
      options: [
        { id: TACOS, label: 'Tacos' },
        { id: RAMEN, label: 'Ramen' },
      ],
      ballots: [
        { userId: MAYA, optionId: RAMEN },
        { userId: JORDAN, optionId: RAMEN },
      ],
    });
    await renderVote(<ChatPollCard message={message} mine={false} />, s);
    await until(() => screen.queryByTestId('poll-result-line') !== null);
    expect(screen.getByText('Closed. Ramen won.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('poll-option-0'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await queued(s, 'cast_ballot')).toEqual([]);
  });

  it('shows a place locked in before anyone voted without a bar, a count or a win', async () => {
    const s = await open();
    await seedPoll(s, {
      status: 'closed',
      winnerOptionId: RAMEN,
      options: [
        { id: TACOS, label: 'Tacos' },
        { id: RAMEN, label: 'Ramen' },
      ],
      ballots: [],
    });
    await renderVote(<ChatPollCard message={message} mine={false} />, s);
    await until(() => screen.queryByTestId('poll-result-line') !== null);
    expect(screen.getByTestId('poll-result-line')).toHaveTextContent(/Locked in/u);
    expect(screen.queryByText(/won/u)).toBeNull();
    expect(screen.getByLabelText('Ramen, winner')).toBeTruthy();
    expect(screen.queryByTestId('poll-option-1')).toBeNull();
  });
});

describe('new poll sheet', () => {
  it('posts only a question with two distinct answers', async () => {
    expect(
      postableOptions({ question: '', options: ['a', 'b'], deadline: 'none', allowChange: true }),
    ).toBeNull();
    expect(
      postableOptions({ question: 'Q', options: ['a', 'A'], deadline: 'none', allowChange: true }),
    ).toBeNull();
    expect(
      postableOptions({
        question: 'Q',
        options: [' a ', '', 'b'],
        deadline: 'none',
        allowChange: true,
      }),
    ).toEqual(['a', 'b']);
    // The line over the button names what is missing, in the order a person fills the sheet in.
    const draft = { deadline: 'none', allowChange: true } as const;
    expect(postBlocker({ ...draft, question: ' ', options: ['a', 'b'] })).toBe('question');
    expect(postBlocker({ ...draft, question: 'Q', options: ['a', ' '] })).toBe('answers');
    expect(postBlocker({ ...draft, question: 'Q', options: ['a', 'A '] })).toBe('same');
    expect(postBlocker({ ...draft, question: 'Q', options: ['a', 'b'] })).toBeNull();

    const s = await open();
    const now = new Date('2026-10-01T00:00:00Z');
    await renderVote(<CreatePollSheet crewId={CREW} now={() => now} />, s);
    await fireEvent.changeText(screen.getByTestId('new-poll-question'), 'Spa on day 3?');
    await fireEvent.changeText(screen.getByTestId('new-poll-option-0'), 'Yes');
    await fireEvent.changeText(screen.getByTestId('new-poll-option-1'), 'No');
    await fireEvent.press(screen.getByTestId('new-poll-add-option'));
    await until(() => screen.queryByTestId('new-poll-option-2') !== null);
    await fireEvent.press(screen.getByTestId('new-poll-post'));
    await until(() => (router.back as jest.Mock).mock.calls.length > 0);
    const [payload] = await queued(s, 'create_poll');
    expect(payload).toMatchObject({
      crew_id: CREW,
      kind: 'generic',
      question: 'Spa on day 3?',
      options: [
        { label: 'Yes', kind: 'text' },
        { label: 'No', kind: 'text' },
      ],
      allow_change: true,
      closes_at: '2026-10-02T00:00:00.000Z',
    });
  });
});
