/** The stop sheet holding an unsaved change asks before the dimmed page or back drops it. */
// The app's own database module loads the native driver; these tests run on the test stack.
jest.mock('@/data/powersync/db', () => ({}));
jest.mock('expo-router', () => ({
  Stack: Object.assign(() => null, { Screen: () => null }),
  usePathname: () => '/',
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, type AlertButton } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PremiumItemSheet } from '../../premium/stop/item-sheet';
import { type ItemDetailActions } from '../item-sheet-look';
import { LAB_MEMBERS, WALK } from '../test-support/stop-fixtures';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const noop = () => undefined;

beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

function setup() {
  const onClose = jest.fn();
  const actions: ItemDetailActions = {
    onSave: noop,
    onMoveToDay: noop,
    onRemove: noop,
    onSkipForMe: noop,
    onOpenPlace: noop,
    onOpenMaps: noop,
    onClose,
  };
  const ui = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <I18nProvider i18n={i18n}>
          <PremiumItemSheet
            item={WALK}
            dayNos={[1, 2, 3]}
            members={LAB_MEMBERS}
            canApply
            actions={actions}
          />
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
  return { onClose, ui };
}

/** Answers the next system alert with the button that reads `choice`. */
function answerAlert(choice: string) {
  return jest.spyOn(Alert, 'alert').mockImplementationOnce((_title, _message, buttons) => {
    (buttons as AlertButton[] | undefined)?.find((button) => button.text === choice)?.onPress?.();
  });
}

describe('stop sheet with an unsaved change', () => {
  it('closes at once with nothing changed', async () => {
    const { onClose, ui } = setup();
    const alert = jest.spyOn(Alert, 'alert');
    const screen = await render(ui);
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(alert).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    alert.mockRestore();
  });

  it('asks first, stays on "Keep editing" and goes on "Discard"', async () => {
    const { onClose, ui } = setup();
    const screen = await render(ui);
    await fireEvent.press(screen.getByTestId('plan-item-move-2'));

    const keep = answerAlert('Keep editing');
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(keep).toHaveBeenCalledWith(
      'Discard this change?',
      expect.any(String),
      expect.any(Array),
      expect.anything(),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(onClose).not.toHaveBeenCalled();
    keep.mockRestore();

    const discard = answerAlert('Discard');
    await fireEvent.press(screen.getByLabelText('Close'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    discard.mockRestore();
  });
});
