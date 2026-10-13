/**
 * The premium pitch board over the real local-first stack, with the api answered at its transport:
 * a tile per place with its votes, a tap queues the ballot, only the organiser moves the board on
 * (GO TO FINAL for two or more, LOCK IN for one, which reveals the winner), a tie for a final spot
 * becomes a pick that is sent with the next try, no signal says so, and an empty board asks for
 * the first pitch.
 */
import { afterEach, describe, expect, it, type jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactElement } from 'react';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { ToastHost } from '@/ui/premium';

import { usePoll } from '../../../data/use-poll';
import {
  BALI,
  CREW,
  JORDAN,
  KYOTO,
  LISBON,
  MAYA,
  POLL,
  queued,
  renderVote,
  seedCrew,
  seedPoll,
  until,
} from '../../../test-support/vote-harness';
import { DestinationBoard } from '../destination-board';

const OPT_KYOTO = '0192f000-0000-7000-8000-000000000611';
const OPT_LISBON = '0192f000-0000-7000-8000-000000000612';
const OPT_BALI = '0192f000-0000-7000-8000-000000000613';

type Answer = { status: number; body: unknown };
let stack: TestLocalFirst | null = null;

/** The stack with every online command posted to `answer` (the api's recorded replies). */
async function open(answer?: (path: string, body: unknown) => Answer | Error) {
  const posted: { path: string; payload: unknown }[] = [];
  stack = await openTestLocalFirst({
    holdUploads: true,
    ...(answer === undefined
      ? {}
      : {
          transport: {
            postJson: (path: string, body: unknown) => {
              posted.push({ path, payload: (body as { payload: unknown }).payload });
              const reply = answer(path, body);
              return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
            },
          },
        }),
  });
  await seedCrew(stack);
  return { s: stack, posted };
}

const APPLIED: Answer = { status: 200, body: { status: 'applied', result: {} } };

afterEach(async () => {
  (router.push as jest.Mock).mockClear();
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

function Board({ me }: { readonly me: string }) {
  const { poll } = usePoll(POLL, me);
  return poll === null ? null : <DestinationBoard poll={poll} me={me} />;
}

const withToasts = (ui: ReactElement) => <ToastHost bottomOffset={0}>{ui}</ToastHost>;

async function seedBoard(s: TestLocalFirst, createdBy: string, places = 2) {
  const all = [
    { id: OPT_KYOTO, label: 'Kyoto', refId: KYOTO },
    { id: OPT_LISBON, label: 'Lisbon', refId: LISBON },
    { id: OPT_BALI, label: 'Bali', refId: BALI },
  ];
  await seedPoll(s, {
    kind: 'destination',
    stage: 'board',
    question: null,
    createdBy,
    options: all.slice(0, places),
    ballots: places > 1 ? [{ userId: MAYA, optionId: OPT_KYOTO }] : [],
  });
}

describe('premium destination board', () => {
  it('draws a tile per place with its votes and queues a ballot on a tap', async () => {
    const { s } = await open();
    await seedBoard(s, MAYA);
    await renderVote(<Board me={s.uid} />, s);
    await until(() => screen.queryByText('Vote open · 1 of 3 in') !== null);
    expect(screen.getByLabelText('Kyoto, 1 vote')).toBeTruthy();
    expect(screen.getByLabelText('Lisbon, 0 votes')).toBeTruthy();
    // A member votes; moving the board on is the organiser's.
    expect(screen.queryByTestId('board-go-to-final')).toBeNull();
    expect(screen.queryByTestId('board-lock-in')).toBeNull();
    await fireEvent.press(screen.getByTestId('board-sticker-1'));
    await until(() => screen.queryByLabelText('Lisbon, 1 vote, your vote') !== null);
    expect(await queued(s, 'cast_ballot')).toEqual([{ poll_id: POLL, option_id: OPT_LISBON }]);
  });

  it("sends the organiser's GO TO FINAL to the api and opens the pitch sheet from the board", async () => {
    const { s, posted } = await open(() => APPLIED);
    await seedBoard(s, s.uid);
    await renderVote(<Board me={s.uid} />, s);
    await until(() => screen.queryByTestId('board-go-to-final') !== null);
    expect(screen.queryByTestId('board-lock-in')).toBeNull();
    await fireEvent.press(screen.getByTestId('board-pitch'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/vote/pitch', params: { crewId: CREW } });
    await fireEvent.press(screen.getByTestId('board-go-to-final'));
    await until(() => posted.length > 0);
    expect(posted[0]).toEqual({ path: '/v1/cmd/advance_poll_stage', payload: { poll_id: POLL } });
  });

  it('turns a tie for the last final spot into a pick, sent with the next try', async () => {
    const { s, posted } = await open((_path, body) => {
      const payload = (body as { payload: { pick?: string[] } }).payload;
      if (payload.pick !== undefined) return APPLIED;
      return {
        status: 409,
        body: {
          error: {
            code: 'STATE_INVALID',
            message: 'tied',
            retryable: false,
            detail: {
              reason: 'needs_pick',
              tied_option_ids: [OPT_LISBON, OPT_BALI],
              settled_option_ids: [OPT_KYOTO],
            },
          },
        },
      };
    });
    await seedBoard(s, s.uid, 3);
    await renderVote(<Board me={s.uid} />, s);
    await until(() => screen.queryByTestId('board-go-to-final') !== null);
    await fireEvent.press(screen.getByTestId('board-go-to-final'));
    await until(() => screen.queryByTestId('pick-finalist') !== null);
    expect(screen.getByText(/Lisbon and Bali are level for the last spot/)).toBeTruthy();
    expect(screen.getByTestId('board-pick-start')).toBeDisabled();
    // Kyoto is already in: only the tied places take a tap.
    await fireEvent.press(screen.getByTestId('board-sticker-0'));
    expect(screen.getByTestId('board-pick-start')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('board-sticker-2'));
    await fireEvent.press(screen.getByTestId('board-pick-start'));
    await until(() => posted.length > 1);
    expect(posted[1]).toEqual({
      path: '/v1/cmd/advance_poll_stage',
      payload: { poll_id: POLL, pick: [OPT_BALI] },
    });
    await until(() => screen.queryByTestId('pick-finalist') === null);
    expect(await queued(s, 'cast_ballot')).toEqual([]);
  });

  it('says the final needs signal when the server cannot be reached', async () => {
    const { s } = await open(() => new Error('offline'));
    await seedBoard(s, s.uid);
    await renderVote(withToasts(<Board me={s.uid} />), s);
    await until(() => screen.queryByTestId('board-go-to-final') !== null);
    await fireEvent.press(screen.getByTestId('board-go-to-final'));
    await until(() => screen.queryByText(/That needs signal/) !== null);
    expect(screen.getByTestId('board-go-to-final')).toBeTruthy();
  });

  it('lets the organiser lock in the only place on the board and reveals it', async () => {
    const { s, posted } = await open(() => APPLIED);
    await seedBoard(s, s.uid, 1);
    await renderVote(<Board me={s.uid} />, s);
    await until(() => screen.queryByTestId('board-lock-in') !== null);
    expect(screen.getByText('Lock in Kyoto')).toBeTruthy();
    expect(screen.queryByTestId('board-go-to-final')).toBeNull();
    await fireEvent.press(screen.getByTestId('board-lock-in'));
    await until(() => (router.push as jest.Mock).mock.calls.length > 0);
    expect(posted[0]).toEqual({ path: '/v1/cmd/close_poll', payload: { poll_id: POLL } });
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/vote/[pollId]/reveal',
      params: { pollId: POLL },
    });
  });

  it('offers a member no lock-in on a single place', async () => {
    const { s } = await open();
    await seedBoard(s, JORDAN, 1);
    await renderVote(<Board me={s.uid} />, s);
    await until(() => screen.queryByTestId('board-sticker-0') !== null);
    expect(screen.queryByTestId('board-lock-in')).toBeNull();
  });

  it('asks for the first pitch on an empty board', async () => {
    const { s } = await open();
    await seedPoll(s, { kind: 'destination', stage: 'board', question: null, options: [] });
    await renderVote(<Board me={s.uid} />, s);
    await until(() => screen.queryByTestId('board-empty') !== null);
    await fireEvent.press(screen.getByTestId('board-pitch-cta'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/vote/pitch', params: { crewId: CREW } });
  });
});
