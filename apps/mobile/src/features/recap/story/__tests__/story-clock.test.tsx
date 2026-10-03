/**
 * The recap story's shared clock: a card's choreography runs on the bar's own played time, so a
 * hold stops every step with the bar and a release carries both on from the same instant, and a
 * card's own length (the route's 9 s) is what the bar waits for before the next card.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));

import { act, screen } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Text } from 'react-native';

import { useStoryClock } from '@/ui/story/story-clock';
import { pushInScale, StoryPlayer } from '@/ui/story/StoryPlayer';
import { renderUi } from '@/ui/test-support/render';

import { stepsReached, useCardTimeline } from '../use-card-timeline';

const STEPS = [1000, 3000, 5000] as const;

function Probe({ id }: { readonly id: string }) {
  const reached = useCardTimeline(STEPS);
  const clock = useStoryClock();
  return (
    <Text testID={`probe-${id}`}>
      {`${String(reached)}|${String(Math.round(clock.playedMs() / 100) * 100)}`}
    </Text>
  );
}

const segments = [
  { id: 'route', label: 'The route', durationMs: 9000, content: <Probe id="route" /> },
  { id: 'awards', label: 'The awards', durationMs: 6000, content: <Probe id="awards" /> },
];

afterEach(() => {
  jest.useRealTimers();
});

describe('recap story clock', () => {
  it('keeps a laid-out card at its own size, where a photo slide pushes in', () => {
    expect(pushInScale({ pushIn: false }, false)).toBe(1);
    expect(pushInScale({}, false)).toBeGreaterThan(1);
    expect(pushInScale({}, true)).toBe(1);
  });

  it('counts the steps a card has reached at a played time', () => {
    expect(stepsReached(STEPS, 0)).toBe(0);
    expect(stepsReached(STEPS, 3000)).toBe(2);
    expect(stepsReached(STEPS, 9000)).toBe(3);
  });

  it('stops every card step with the bar on a hold and carries both on together', async () => {
    jest.useFakeTimers();
    const onIndexChange = jest.fn();
    const ui = (held: boolean) => (
      <StoryPlayer segments={segments} held={held} onIndexChange={onIndexChange} />
    );
    const { rerender } = await renderUi(ui(false));
    await act(() => jest.advanceTimersByTime(2000));
    expect(screen.getByTestId('probe-route')).toHaveTextContent(/^1\|/u);

    // Held for twenty seconds: neither the card nor the bar moves.
    await rerender(ui(true));
    await act(() => jest.advanceTimersByTime(20_000));
    expect(screen.getByTestId('probe-route')).toHaveTextContent('1|2000');
    expect(onIndexChange).not.toHaveBeenCalled();

    // Let go: the second step lands one second later, on the same clock the bar reads.
    await rerender(ui(false));
    await act(() => jest.advanceTimersByTime(999));
    expect(screen.getByTestId('probe-route')).toHaveTextContent(/^1\|/u);
    await act(() => jest.advanceTimersByTime(2));
    expect(screen.getByTestId('probe-route')).toHaveTextContent('2|3000');

    // The route card is nine seconds long: the next card comes at nine, not at five or six.
    await act(() => jest.advanceTimersByTime(5000));
    expect(onIndexChange).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTime(1000));
    expect(onIndexChange).toHaveBeenCalledWith(1);
    expect(screen.getByTestId('probe-awards')).toHaveTextContent('0|0');
    await act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByTestId('probe-awards')).toHaveTextContent('1|1000');
  });
});
