/**
 * The destination board and the pitch sheet over the real local-first stack, with the pitch
 * stream replayed from the api's recorded answer: the board draws one sticker per place with the
 * vote count, a tap queues the ballot, the organiser can go to the final, an empty board asks for
 * a pitch; the pitch card streams sticker → chips → headline → reasons → quote, a dropped stream
 * offers a retry, ADD TO THE VOTE queues the candidate with its pitch and says who has voted, and a
 * pitch during a final is queued for the next vote.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
// Loops and section fades are timing, not layout: the tests see their resting content.
jest.mock('@/motion', () => ({
  ...jest.requireActual<Record<string, unknown>>('@/motion'),
  useLoop: () => ({}),
}));
jest.mock('../fade-section', () => ({
  FadeSection: ({ children }: { children: unknown }) => children,
}));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { toastQueue } from '@/motion';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { DestinationBoard } from '../destination-board';
import { PitchSheet } from '../pitch-sheet';
import { usePoll } from '../../data/use-poll';
import {
  kyotoPitchFrames,
  moroccoResults,
  PITCH_ID,
  replayServices,
  type HeldStream,
} from '../../test-support/replay-services';
import {
  BALI,
  CREW,
  KYOTO,
  LISBON,
  MAYA,
  POLL,
  queued,
  renderVote,
  seedCrew,
  seedPoll,
  until,
} from '../../test-support/vote-harness';

const OPT_KYOTO = '0192f000-0000-7000-8000-000000000611';
const OPT_LISBON = '0192f000-0000-7000-8000-000000000612';
let stack: TestLocalFirst | null = null;

async function open(): Promise<TestLocalFirst> {
  stack = await openTestLocalFirst({ holdUploads: true });
  await seedCrew(stack);
  return stack;
}

afterEach(async () => {
  (router.push as jest.Mock).mockClear();
  (router.back as jest.Mock).mockClear();
  toastQueue.dismiss();
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

function Board({ me }: { readonly me: string }) {
  const { poll } = usePoll(POLL, me);
  return poll === null ? null : <DestinationBoard poll={poll} me={me} />;
}

async function seedBoard(
  s: TestLocalFirst,
  options: { createdBy?: string; stage?: 'board' | 'final' } = {},
) {
  await seedPoll(s, {
    kind: 'destination',
    stage: options.stage ?? 'board',
    question: null,
    createdBy: options.createdBy ?? MAYA,
    options: [
      { id: OPT_KYOTO, label: 'Kyoto', refId: KYOTO },
      { id: OPT_LISBON, label: 'Lisbon', refId: LISBON },
    ],
    ballots: [{ userId: MAYA, optionId: OPT_KYOTO }],
  });
}

describe('destination board', () => {
  it('draws a sticker per place with its votes and queues a ballot on a tap', async () => {
    const s = await open();
    await seedBoard(s);
    await renderVote(<Board me={s.uid} />, s);
    await until(() => screen.queryByText('VOTE OPEN · 1 OF 3 IN') !== null);
    expect(screen.getByTestId('board-sticker-1')).toBeTruthy();
    expect(screen.queryByTestId('board-go-to-final')).toBeNull();
    await fireEvent.press(screen.getByTestId('board-sticker-1'));
    await until(() => screen.queryByText('VOTE OPEN · 2 OF 3 IN') !== null);
    expect(await queued(s, 'cast_ballot')).toEqual([{ poll_id: POLL, option_id: OPT_LISBON }]);
  });

  it('lets the organiser go to the final and opens the pitch sheet from the slot', async () => {
    const s = await open();
    await seedBoard(s, { createdBy: s.uid });
    await renderVote(<Board me={s.uid} />, s);
    await until(() => screen.queryByTestId('board-go-to-final') !== null);
    await fireEvent.press(screen.getByTestId('board-pitch'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/vote/pitch', params: { crewId: CREW } });
  });

  it("sends the organiser's GO TO THE FINAL to the api", async () => {
    const posted: { path: string; body: unknown }[] = [];
    stack = await openTestLocalFirst({
      holdUploads: true,
      transport: {
        postJson: (path, body) => {
          posted.push({ path, body });
          return Promise.resolve({ status: 200, body: { status: 'applied', result: {} } });
        },
      },
    });
    await seedCrew(stack);
    await seedBoard(stack, { createdBy: stack.uid });
    await renderVote(<Board me={stack.uid} />, stack);
    await until(() => screen.queryByTestId('board-go-to-final') !== null);
    await fireEvent.press(screen.getByTestId('board-go-to-final'));
    await until(() => posted.length > 0);
    expect(posted[0]?.path).toBe('/v1/cmd/advance_poll_stage');
    expect((posted[0]?.body as { payload: unknown }).payload).toEqual({ poll_id: POLL });
  });

  it('asks for the first pitch on an empty board', async () => {
    const s = await open();
    await seedPoll(s, { kind: 'destination', stage: 'board', question: null, options: [] });
    await renderVote(<Board me={s.uid} />, s);
    await until(() => screen.queryByTestId('board-empty') !== null);
    await fireEvent.press(screen.getByTestId('board-pitch-cta'));
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});

describe('pitch sheet', () => {
  it('offers ADD TO THE VOTE only once a place is picked', async () => {
    const s = await open();
    await seedBoard(s);
    await renderVote(
      <PitchSheet crewId={CREW} />,
      s,
      replayServices({ results: moroccoResults, pitch: kyotoPitchFrames(s.uid) }),
    );
    await fireEvent.changeText(screen.getByTestId('pitch-search'), 'morocc');
    await until(() => screen.queryByTestId('pitch-result-1') !== null);
    expect(screen.queryByTestId('pitch-add')).toBeNull();
    await fireEvent.press(screen.getByTestId('pitch-result-0'));
    await until(() => screen.queryByTestId('pitch-add') !== null);
    expect(screen.queryByTestId('pitch-results')).toBeNull();
  });

  it('streams the pitch section by section, then adds the place with its pitch', async () => {
    const s = await open();
    await seedBoard(s);
    let held: HeldStream | null = null;
    const services = replayServices({
      pitch: kyotoPitchFrames(s.uid),
      hold: (stream) => (held = stream),
    });
    await renderVote(<PitchSheet crewId={CREW} placeId={BALI} />, s, services);
    await until(() => held !== null);
    expect(screen.queryByTestId('pitch-headline')).toBeNull();
    await act(() => held?.step(4));
    await until(() => screen.queryByTestId('pitch-chips') !== null);
    expect(screen.getByText('$412 EACH')).toBeTruthy();
    expect(screen.getByText('7H FROM SIN')).toBeTruthy();
    expect(screen.queryByTestId('pitch-reasons')).toBeNull();
    await act(() => held?.step(4));
    await until(() => screen.queryByTestId('pitch-quote') !== null);
    expect(screen.getByText('KYOTO IN APRIL: SIX OF YOU, BLOSSOMS WAITING')).toBeTruthy();
    await act(() => {
      held?.step(2);
      held?.end();
    });
    await until(() => screen.queryByTestId('pitch-alternatives') !== null);
    await fireEvent.press(screen.getByTestId('pitch-add'));
    await until(() => (router.back as jest.Mock).mock.calls.length > 0);
    expect(await queued(s, 'add_poll_candidate')).toEqual([
      { crew_id: CREW, place_id: BALI, pitch_id: PITCH_ID },
    ]);
    expect(toastQueue.getCurrent()?.title).toBe("Kyoto's on the board. 1 of 3 have voted.");
  });

  it('offers a retry when the stream drops before the headline', async () => {
    const s = await open();
    let held: HeldStream | null = null;
    const services = replayServices({
      pitch: kyotoPitchFrames(s.uid),
      hold: (stream) => (held = stream),
    });
    await renderVote(<PitchSheet crewId={CREW} placeId={KYOTO} />, s, services);
    await until(() => held !== null);
    await act(() => {
      held?.step(1);
      held?.end(true);
    });
    await until(() => screen.queryByTestId('pitch-error') !== null);
    held = null;
    await fireEvent.press(screen.getByTestId('pitch-retry'));
    await until(() => held !== null);
  });

  it('queues a pitch while a final is on, and says a place is already on the board', async () => {
    const s = await open();
    await seedBoard(s, { stage: 'final' });
    await renderVote(
      <PitchSheet crewId={CREW} placeId={BALI} />,
      s,
      replayServices({ pitch: kyotoPitchFrames(s.uid) }),
    );
    await until(() => screen.queryByTestId('pitch-quote') !== null);
    await fireEvent.press(screen.getByTestId('pitch-add'));
    await until(() => toastQueue.getCurrent() !== null);
    expect(toastQueue.getCurrent()?.title).toBe(
      'Kyoto is pitched. It joins the vote after this one.',
    );
  });

  it('leads back to the board for a place already on it', async () => {
    const s = await open();
    await seedBoard(s);
    await renderVote(
      <PitchSheet crewId={CREW} placeId={KYOTO} />,
      s,
      replayServices({ pitch: kyotoPitchFrames(s.uid) }),
    );
    await until(() => screen.queryByText(/already on the board/i) !== null);
    await fireEvent.press(screen.getByTestId('pitch-add'));
    expect(await queued(s, 'add_poll_candidate')).toEqual([]);
    expect(router.back).toHaveBeenCalled();
  });
});
