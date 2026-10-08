// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../test-support/skia-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { act, renderHook, screen } from '@testing-library/react-native';
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, View } from 'react-native';

import type { SkiaEngine } from '@cp/critter-art/skia';
import { tokens } from '@cp/design-tokens';

import { drawGate } from '@/motion/patterns/draw';

import { ChoiceChip } from '../chips/ChoiceChip';
import { CountBadge } from '../chips/CountBadge';
import { FilterChip } from '../chips/FilterChip';
import { Avatar } from '../people/Avatar';
import { AvatarStack } from '../people/AvatarStack';
import { CritterAvatar } from '../people/CritterAvatar';
import { EmptySeat } from '../people/EmptySeat';
import { GuideLine } from '../people/GuideLine';
import { LiveSticker } from '../people/LiveSticker';
import { BLINK_CLOSED_MS, BLINK_MIN_GAP_MS, useBlink } from '../people/use-blink';
import { EmptyState } from '../states/EmptyState';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { createCanvasKitEngine, createMemoryStickerCache } from '../test-support/canvaskit-engine';
import { renderUi } from '../test-support/render';

let engine: SkiaEngine;
beforeAll(async () => {
  engine = await createCanvasKitEngine();
});
afterEach(() => {
  jest.useRealTimers();
});

/** Turns the OS Reduce Motion setting on for one test; restore it with the returned spy. */
function reduceMotion() {
  return jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
}

describe('chips', () => {
  it('reads choice and filter chips as selectable buttons', async () => {
    await renderUi(
      <View>
        <ChoiceChip label="Sunrise" selected onPress={jest.fn()} tilt={-2} />
        <ChoiceChip label="Museums" selected={false} onPress={jest.fn()} tilt={3} />
        <FilterChip label="Food" count={12} selected onPress={jest.fn()} />
      </View>,
    );
    const sunrise = screen.getByRole('button', { name: 'Sunrise', selected: true });
    const museums = screen.getByRole('button', { name: 'Museums', selected: false });
    expect(JSON.stringify(sunrise.props.style)).toContain('"rotate":"0deg"');
    expect(JSON.stringify(museums.props.style)).toContain('"rotate":"3deg"');
    expect(screen.getByRole('button', { name: 'Food, 12', selected: true })).toBeTruthy();
  });

  it('hides zero badges and caps large counts', async () => {
    await renderUi(
      <View>
        <CountBadge count={0} testID="zero" />
        <CountBadge count={140} />
      </View>,
    );
    expect(screen.queryByTestId('zero')).toBeNull();
    expect(screen.getByLabelText('140 new')).toBeTruthy();
    expect(screen.getByText('99+')).toBeTruthy();
  });
});

describe('people', () => {
  it('names avatars, marks pending ones and patterns members past six', async () => {
    await renderUi(
      <View>
        <Avatar name="winston" />
        <Avatar name="Rosa" joinIndex={4} pending />
        <Avatar name="Kofi" joinIndex={6} testID="seventh" />
      </View>,
    );
    expect(screen.getByRole('image', { name: 'winston' })).toBeTruthy();
    expect(screen.getByText('W')).toBeTruthy();
    expect(screen.getByRole('image', { name: 'Rosa, invited' })).toBeTruthy();
    expect(JSON.stringify(screen.getByTestId('seventh').props.style)).toContain(
      '"borderStyle":"dashed"',
    );
  });

  it('reads a stack as one list with its overflow count', async () => {
    const members = ['A', 'B', 'C', 'D', 'E', 'F'].map((name, joinIndex) => ({
      key: name,
      name,
      joinIndex,
    }));
    await renderUi(<AvatarStack members={members} max={4} />);
    expect(screen.getByLabelText('A, B, C, D and 2 more')).toBeTruthy();
    expect(screen.queryAllByRole('image')).toHaveLength(0);
  });

  it('labels critter avatars, empty seats and guide lines', async () => {
    const onInvite = jest.fn();
    await renderUi(
      <View>
        <CritterAvatar name="Tokek" tier="epic" sticker={<View />} />
        <EmptySeat onPress={onInvite} />
        <SurfaceToneProvider value="paper">
          <GuideLine guide="pon" name="Pon" line="Beat the buses." testID="pon" />
        </SurfaceToneProvider>
      </View>,
    );
    expect(screen.getByRole('image', { name: 'Tokek, Epic' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Empty seat' })).toBeTruthy();
    expect(screen.getByLabelText('Pon: Beat the buses.')).toBeTruthy();
    const voice = screen.getByText('Beat the buses.', { includeHiddenElements: true });
    expect(JSON.stringify(voice.props.style)).toContain(tokens.guide.onPaper.pon);
  });

  it('writes a guide line in the card ink on a colour card, never in the guide colour', async () => {
    await renderUi(
      <SurfaceToneProvider value="accent">
        <GuideLine guide="tokek" name="Tokek" line="Nothing here yet." />
        <EmptyState guide="tokek" guideName="Tokek" title="No trips yet" line="Start one." />
      </SurfaceToneProvider>,
    );
    for (const line of ['Nothing here yet.', 'Start one.']) {
      const style = JSON.stringify(
        screen.getByText(line, { includeHiddenElements: true }).props.style,
      );
      expect(style).toContain(tokens.semantic.text.onAccent);
      expect(style).not.toContain(tokens.guide.tokek);
    }
  });
});

describe('LiveSticker', () => {
  it('draws at most two at once and queues the third until a slot frees', async () => {
    jest.useFakeTimers();
    const cache = createMemoryStickerCache();
    await renderUi(
      <View>
        {['gecko', 'tanuki', 'puffin'].map((kind) => (
          <LiveSticker key={kind} kind={kind} name={kind} size={64} engine={engine} cache={cache} />
        ))}
      </View>,
    );
    await act(() => jest.advanceTimersByTime(0));
    expect(drawGate.activeCount).toBe(2);
    expect(drawGate.queueLength).toBe(1);
    await act(() => jest.advanceTimersByTime(1500));
    expect(drawGate.activeCount).toBe(1);
    expect(drawGate.queueLength).toBe(0);
    await act(() => jest.advanceTimersByTime(1500));
    expect(drawGate.activeCount).toBe(0);
  });

  it('skips the draw-on entirely under Reduce Motion', async () => {
    const reduced = reduceMotion();
    await renderUi(
      <LiveSticker
        kind="gecko"
        name="Tokek"
        size={64}
        engine={engine}
        cache={createMemoryStickerCache()}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(drawGate.activeCount).toBe(0);
    expect(drawGate.queueLength).toBe(0);
    reduced.mockRestore();
  });
});

describe('useBlink', () => {
  const firstGap = () => 0;

  it('shuts the eyes for 150 ms after the idle gap', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => useBlink({ random: firstGap }));
    expect(result.current).toBe(false);
    await act(() => jest.advanceTimersByTime(BLINK_MIN_GAP_MS));
    expect(result.current).toBe(true);
    await act(() => jest.advanceTimersByTime(BLINK_CLOSED_MS));
    expect(result.current).toBe(false);
  });

  it('stays open off-screen', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => useBlink({ visible: false, random: firstGap }));
    await act(() => jest.advanceTimersByTime(BLINK_MIN_GAP_MS));
    expect(result.current).toBe(false);
  });

  it('stays open under Reduce Motion', async () => {
    const reduced = reduceMotion();
    jest.useFakeTimers();
    const { result } = await renderHook(() => useBlink({ random: firstGap }));
    await act(async () => {
      await Promise.resolve();
    });
    await act(() => jest.advanceTimersByTime(BLINK_MIN_GAP_MS));
    expect(result.current).toBe(false);
    reduced.mockRestore();
  });
});
