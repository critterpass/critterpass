// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));

// This package's reanimated stand-in has no layout-animation builders; the pass needs one. The
// builder is an inert marker, and the stand-in's `Animated.View` is a plain `View`, so a view's
// `entering` prop shows whether it was given an entering animation.
jest.mock('react-native-reanimated', () => {
  // The module name maps to the stand-in's file, so the real file is asked for by name here.
  const standIn = jest.requireActual<Record<string, unknown>>(
    '@/motion/test-support/reanimated-mock',
  );
  const builder = { springify: () => builder };
  return { ...standIn, __esModule: true, FadeInDown: { delay: () => builder } };
});

import { screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { renderUi } from '@/ui/test-support/render';

import { BoardView, type BoardViewProps } from '../board/board-view';

const noop = () => undefined;

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const onScreen = (props: BoardViewProps) => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <BoardView {...props} />
  </SafeAreaProvider>
);

const pass = (boarded: boolean): BoardViewProps => ({
  guide: 'chava',
  eyebrow: 'Đà Nẵng · Oct 2–4',
  name: 'Linh',
  crewIn: [{ key: 'u-khanh', name: 'Khanh', joinIndex: 0 }],
  counter: '1/2',
  boarded,
  pending: false,
  ticket: {
    from: 'SGN',
    to: 'DAD',
    passenger: 'Linh Nguyen',
    dates: 'Oct 2–4',
    share: null,
    group: 'Proposal Crew',
    seat: 'A02',
  },
  onBoard: noop,
  onMaybe: noop,
  onOut: noop,
  onDone: noop,
});

const eggEntering = (): unknown =>
  (screen.getByTestId('board-egg').props as { entering?: unknown }).entering;

describe('the egg on the boarding pass', () => {
  it('is drawn at once, with no entering animation, on a pass opened already boarded', async () => {
    await renderUi(onScreen(pass(true)));
    expect(screen.getByTestId('board-egg')).toBeTruthy();
    expect(eggEntering()).toBeUndefined();
  });

  it('drops in when boarding happens on this screen', async () => {
    const view = await renderUi(onScreen(pass(false)));
    expect(screen.queryByTestId('board-egg')).toBeNull();

    await view.rerender(onScreen(pass(true)));
    expect(eggEntering()).toBeDefined();
  });
});
