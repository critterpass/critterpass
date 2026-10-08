import { act, fireEvent, screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { Gesture, State } from 'react-native-gesture-handler';
import type { GestureType } from 'react-native-gesture-handler';
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { StyleSheet, Text } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { Composer, composerMicGestures } from '../chat/Composer';
import { DayRow, dayRowGestures } from '../plan/DayRow';
import { MovableBlock, movableBlockGestures } from '../plan/TimelineBlock';
import { StoryPlayer, storyPlayerGestures } from '../story/StoryPlayer';
import { renderUi } from '../test-support/render';
import { MIN_TOUCH_TARGET } from '../theme';

/** The components build declarative `Gesture.*()` objects; the lookup also covers the hook kind. */
function gestureById(testId: string): GestureType {
  return getByGestureTestId(testId) as GestureType;
}

/** Handler tags a gesture was told to wait for (`requireExternalGestureToFail` keeps the objects). */
function waitsFor(gesture: GestureType): number[] {
  return ((gesture.config.requireToFail ?? []) as GestureType[]).map((g) => g.handlerTag);
}

/** Handler tags a gesture may run alongside or blocks; a race has neither. */
function otherRelations(gesture: GestureType): unknown[] {
  return [...(gesture.config.simultaneousWith ?? []), ...(gesture.config.blocksHandlers ?? [])];
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
      Object.values(dayRowGestures(Gesture.Pan(), Gesture.Tap())),
      Object.values(movableBlockGestures(Gesture.Pan(), Gesture.Tap())),
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

  it('races the day row drag and press without either waiting', async () => {
    const onPress = jest.fn();
    await renderUi(
      <DayRow
        dayNumber={2}
        weekday="Tue"
        title="Ridge day"
        onPress={onPress}
        reorder={{ index: 0, count: 3, rowHeight: 64, onReorder: () => {} }}
      />,
    );
    const press = gestureById('day-row-press');
    const drag = gestureById('day-row-drag');
    expect(press.handlerName).toBe('TapGestureHandler');
    expect(drag.handlerName).toBe('PanGestureHandler');
    for (const gesture of [press, drag]) {
      expect(waitsFor(gesture)).toEqual([]);
      expect(otherRelations(gesture)).toEqual([]);
    }

    await fire(endTap(press));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('races the timeline block drag and press over a touch area grown past a short slot', async () => {
    const onSelect = jest.fn();
    await renderUi(
      <MovableBlock
        block={{
          id: 'walk',
          title: 'Ridge walk',
          start: 840,
          end: 855,
          color: tokens.color.ink['900'],
        }}
        selected={false}
        onSelect={onSelect}
        onMove={() => {}}
        bounds={{ min: 480, max: 1320 }}
        pointsPerMinute={1}
        top={0}
      />,
    );
    const press = gestureById('timeline-block-press');
    const drag = gestureById('timeline-block-drag');
    expect(press.handlerName).toBe('TapGestureHandler');
    expect(drag.handlerName).toBe('PanGestureHandler');
    for (const gesture of [press, drag]) {
      expect(waitsFor(gesture)).toEqual([]);
      expect(otherRelations(gesture)).toEqual([]);
    }
    // A 15-minute slot at 1 pt a minute draws 15 pt tall; Android ignores hit slop past a parent,
    // so the gesture views themselves span the minimum target, centred on the drawn block.
    const reach = Math.ceil((MIN_TOUCH_TARGET - 15) / 2);
    const area = StyleSheet.flatten(
      screen.getByTestId('timeline-block-walk').props.style as StyleProp<ViewStyle>,
    );
    expect(area).toEqual(expect.objectContaining({ top: -reach, height: 15 + 2 * reach }));
    expect(area?.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    const face = screen.getByTestId('timeline-block-walk-face');
    expect(StyleSheet.flatten(face.parent?.props.style as StyleProp<ViewStyle>)).toEqual(
      expect.objectContaining({ paddingVertical: reach }),
    );

    await fire(endTap(press));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
