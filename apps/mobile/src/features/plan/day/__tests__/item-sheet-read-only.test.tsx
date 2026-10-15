/** The stop sheet on a plan this person cannot edit: read only, with nothing to change. */
// The app's own database module loads the native driver; these tests run on the test stack.
jest.mock('@/data/powersync/db', () => ({}));
jest.mock('expo-router', () => ({
  // The premium pages declare their native header through the stack's screen.
  Stack: Object.assign(() => null, { Screen: () => null }),
  usePathname: () => '/',
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
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

describe('plan item sheet', () => {
  it('opens a stop to read on a plan that cannot be edited: no move, skip, remove or save', async () => {
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
            <PremiumItemSheet
              item={WALK}
              dayNos={[1, 2, 3]}
              members={LAB_MEMBERS}
              canApply
              readOnly={readOnly}
              actions={actions}
            />
          </I18nProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
    const editable = await render(ui(false));
    for (const id of ['plan-item-move-2', 'plan-item-skip', 'plan-item-remove', 'plan-item-save']) {
      expect(editable.queryByTestId(id)).not.toBeNull();
    }
    await editable.unmount();

    const screen = await render(ui(true));
    expect(screen.queryByTestId('plan-item-sheet')).not.toBeNull();
    for (const id of ['plan-item-move-2', 'plan-item-skip', 'plan-item-remove', 'plan-item-save']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
  });
});
