/**
 * The pitch sheet over the real local-first stack, with the pitch stream replayed from the api's
 * recorded answer: the pitch card streams chips → headline → reasons → quote, a dropped stream
 * offers a retry, ADD TO THE VOTE queues the candidate with its pitch and says who has voted, and a
 * pitch during a final is queued for the next vote.
 */
// Loops and section fades are timing, not layout: the tests see their resting content.
jest.mock('@/motion', () => ({
  ...jest.requireActual<Record<string, unknown>>('@/motion'),
  useLoop: () => ({}),
}));
jest.mock('../fade-section', () => ({
  FadeSection: ({ children }: { children: unknown }) => children,
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

import { PremiumPitchSheet as PitchSheet } from '../../premium/pitch/pitch-sheet';
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

  it('says when no place matches what was typed', async () => {
    const s = await open();
    await seedBoard(s);
    await renderVote(<PitchSheet crewId={CREW} />, s, replayServices({ results: [] }));
    await fireEvent.changeText(screen.getByTestId('pitch-search'), 'morrocco');
    await until(() => screen.queryByTestId('pitch-no-results') !== null);
    expect(screen.queryByTestId('pitch-results')).toBeNull();
    expect(screen.queryByTestId('pitch-add')).toBeNull();
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
    expect(screen.getByText(/^\$412 each$/i)).toBeTruthy();
    expect(screen.getByText(/^7h from SIN$/i)).toBeTruthy();
    expect(screen.queryByTestId('pitch-reasons')).toBeNull();
    await act(() => held?.step(4));
    await until(() => screen.queryByTestId('pitch-quote') !== null);
    expect(screen.getByText(/^Kyoto in April: six of you, blossoms waiting$/i)).toBeTruthy();
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
