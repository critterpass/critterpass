// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../../../../ui/test-support/skia-double'));

import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../../../../lib/theme';
import { ScreenJoltProvider } from '../../../../motion/patterns/thud';
import { resetMotionModeForTests } from '../../../../motion/test-support/reset-motion-mode';
import { resetPresenterForTests } from '../../../../ui/sheet/presenter';
import { LAB_MEMBERS, WALK } from '../dev/lab-fixtures';
import { ItemDetailSheet, type ItemDetailActions } from '../item-detail-sheet';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const noop = () => undefined;

beforeEach(async () => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  resetPresenterForTests();
  await resetMotionModeForTests();
});

describe('plan item sheet', () => {
  it('scrolls its details inside the sheet: a drag in content scrolled down does not close it', async () => {
    const onClose = jest.fn<() => void>();
    const actions: ItemDetailActions = {
      onSave: noop,
      onMoveToDay: noop,
      onRemove: noop,
      onSkipForMe: noop,
      onOpenPlace: noop,
      onOpenMaps: noop,
      onClose,
    };
    const ui = () => (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <I18nProvider i18n={i18n}>
            <ThemeProvider>
              <ScreenJoltProvider>
                <ItemDetailSheet
                  item={WALK}
                  dayNos={[1, 2, 3]}
                  members={LAB_MEMBERS}
                  canApply
                  actions={actions}
                />
              </ScreenJoltProvider>
            </ThemeProvider>
          </I18nProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
    // Rendered twice: under Jest's Reanimated double an animated style is only read during render,
    // so the second pass has the sheet risen to its detent.
    const screen = await render(ui());
    await screen.rerender(ui());
    // The details run past the sheet (notes, MOVE TO, comments, SAVE): read down to them.
    await fireEvent.scroll(screen.getByTestId('plan-item-scroll'), {
      nativeEvent: { contentOffset: { x: 0, y: 160 } },
    });
    await act(() => {
      fireGestureHandler(getByGestureTestId('plan-item-sheet-drag'), [
        { state: State.BEGAN, y: 400, translationY: 0 },
        { state: State.ACTIVE, y: 400, translationY: 0 },
        { state: State.ACTIVE, y: 600, translationY: 200 },
        { state: State.ACTIVE, y: 800, translationY: 400 },
        { state: State.END, y: 800, translationY: 400, velocityY: 0 },
      ]);
    });
    expect(onClose).not.toHaveBeenCalled();

    // Back at the top of the details, the same drag hands off to the sheet and closes it.
    await fireEvent.scroll(screen.getByTestId('plan-item-scroll'), {
      nativeEvent: { contentOffset: { x: 0, y: 0 } },
    });
    await act(() => {
      fireGestureHandler(getByGestureTestId('plan-item-sheet-drag'), [
        { state: State.BEGAN, y: 400, translationY: 0 },
        { state: State.ACTIVE, y: 400, translationY: 0 },
        { state: State.ACTIVE, y: 600, translationY: 200 },
        { state: State.ACTIVE, y: 800, translationY: 400 },
        { state: State.END, y: 800, translationY: 400, velocityY: 0 },
      ]);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens a stop to read on a plan that cannot be edited: no time field, move, skip, remove or save', async () => {
    const actions: ItemDetailActions = {
      onSave: noop,
      onMoveToDay: noop,
      onRemove: noop,
      onSkipForMe: noop,
      onOpenPlace: noop,
      onOpenMaps: noop,
      onClose: noop,
    };
    const ui = (readOnly: boolean) => (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <I18nProvider i18n={i18n}>
            <ThemeProvider>
              <ScreenJoltProvider>
                <ItemDetailSheet
                  item={WALK}
                  dayNos={[1, 2, 3]}
                  members={LAB_MEMBERS}
                  canApply
                  readOnly={readOnly}
                  actions={actions}
                />
              </ScreenJoltProvider>
            </ThemeProvider>
          </I18nProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
    const editable = await render(ui(false));
    for (const id of ['plan-item-move-2', 'plan-item-skip', 'plan-item-remove', 'plan-item-save']) {
      expect(editable.queryByTestId(id)).not.toBeNull();
    }
    await editable.unmount();
    resetPresenterForTests();

    const screen = await render(ui(true));
    expect(screen.queryByTestId('plan-item-time')).not.toBeNull();
    for (const id of ['plan-item-move-2', 'plan-item-skip', 'plan-item-remove', 'plan-item-save']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
  });
});
