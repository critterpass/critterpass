import { act, fireEvent, screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { Gesture, State } from 'react-native-gesture-handler';
import type { GestureType } from 'react-native-gesture-handler';
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { Text } from 'react-native';

import { Composer, composerMicGestures } from '../chat/Composer';
import { StoryPlayer, storyPlayerGestures } from '../story/StoryPlayer';
import { renderUi } from '../test-support/render';

/** The components build declarative `Gesture.*()` objects; the lookup also covers the hook kind. */
function gestureById(testId: string): GestureType {
  return getByGestureTestId(testId) as GestureType;
}

/** Handler tags a gesture was told to wait for (`requireExternalGestureToFail` keeps the objects). */
function waitsFor(gesture: GestureType): number[] {
  return ((gesture.config.requireToFail ?? []) as GestureType[]).map((g) => g.handlerTag);
}

/** `scheduleOnRN` hops to the JS thread through a microtask: flush it inside `act`. */
async function fire(run: () => void) {
  await act(async () => {
    run();
    await Promise.resolve();
  });
}

const endTap = (tap: GestureType) => () =>
  tap.handlers.onEnd?.({ state: State.END } as never, true);
const startHold = (hold: GestureType) => () =>
  hold.handlers.onStart?.({ state: State.ACTIVE } as never);

describe('one gesture per native view', () => {
  it('splits every composed pair into two single-gesture views', () => {
    const pairs = [
      Object.values(composerMicGestures(Gesture.LongPress(), Gesture.Tap())),
      Object.values(storyPlayerGestures(Gesture.LongPress(), Gesture.Tap())),
    ];
    for (const pair of pairs) {
      expect(pair).toHaveLength(2);
      for (const gesture of pair) expect(gesture.toGestureArray()).toHaveLength(1);
    }
  });

  it('makes the composer mic tap wait for the hold to fail', async () => {
    const onMicTap = jest.fn();
    const onHoldStart = jest.fn();
    await renderUi(
      <Composer
        value=""
        onChangeText={() => {}}
        onSend={() => {}}
        placeholder="Message"
        onMicTap={onMicTap}
        onHoldStart={onHoldStart}
        onHoldEnd={() => {}}
      />,
    );
    const tap = gestureById('composer-mic-tap');
    const hold = gestureById('composer-mic-hold');
    expect(tap.handlerName).toBe('TapGestureHandler');
    expect(hold.handlerName).toBe('LongPressGestureHandler');
    expect(waitsFor(tap)).toContain(hold.handlerTag);

    await fire(endTap(tap));
    expect(onMicTap).toHaveBeenCalledTimes(1);
    await fire(startHold(hold));
    expect(onHoldStart).toHaveBeenCalledTimes(1);
  });

  it('makes the story tap wait for the hold to fail and steps on tap', async () => {
    const onIndexChange = jest.fn();
    await renderUi(
      <StoryPlayer
        segments={[
          { id: 'a', label: 'Beach', content: <Text>Beach</Text> },
          { id: 'b', label: 'Ridge', content: <Text>Ridge</Text> },
        ]}
        onIndexChange={onIndexChange}
      />,
    );
    const tap = gestureById('story-tap');
    const hold = gestureById('story-hold');
    expect(tap.handlerName).toBe('TapGestureHandler');
    expect(hold.handlerName).toBe('LongPressGestureHandler');
    expect(waitsFor(tap)).toContain(hold.handlerTag);

    await fire(() => tap.handlers.onEnd?.({ state: State.END, x: 1 } as never, true));
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
  });

  it('keeps a pause made by its action through a tap and resumes only after a hold', async () => {
    await renderUi(
      <StoryPlayer
        segments={[
          { id: 'a', label: 'Beach', content: <Text>Beach</Text> },
          { id: 'b', label: 'Ridge', content: <Text>Ridge</Text> },
        ]}
      />,
    );
    const hold = gestureById('story-hold');
    // The slide's own action reads "Pause" while playing and "Play" while paused.
    const pauseAction = (): string | undefined =>
      (
        screen.getByRole('adjustable').props.accessibilityActions as readonly {
          name: string;
          label?: string;
        }[]
      ).find((action) => action.name === 'activate')?.label;
    await fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    expect(pauseAction()).toBe('Play');

    // A tap fails the hold, which still finalizes.
    await fire(() => hold.handlers.onFinalize?.({ state: State.FAILED } as never, false));
    expect(pauseAction()).toBe('Play');

    await fire(() => hold.handlers.onStart?.({ state: State.ACTIVE } as never));
    await fire(() => hold.handlers.onFinalize?.({ state: State.END } as never, true));
    expect(pauseAction()).toBe('Pause');
  });
});
