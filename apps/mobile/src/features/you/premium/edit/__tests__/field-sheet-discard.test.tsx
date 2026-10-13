/**
 * An edit-profile field sheet never drops a change without asking: Cancel on an untouched sheet
 * closes it at once; with a change typed it asks, "Keep editing" keeps the sheet and the text, and
 * only "Discard" closes it.
 */
import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NamePremiumSheet } from '../field-sheets-premium';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderSheet(onClose: () => void) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <NamePremiumSheet value="Hân" onDone={jest.fn()} onClose={onClose} />
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

/** Answers the discard question with "Keep editing" (first) or "Discard" (last). */
function answer(choice: 'keep' | 'discard') {
  return jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    const pick = choice === 'keep' ? buttons?.[0] : buttons?.[buttons.length - 1];
    pick?.onPress?.();
  });
}

describe('edit-profile field sheets', () => {
  it('closes an untouched sheet without asking', async () => {
    const onClose = jest.fn();
    const alert = jest.spyOn(Alert, 'alert');
    await renderSheet(onClose);
    await fireEvent.press(screen.getByTestId('you-edit-name-sheet-cancel'));
    expect(alert).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('asks before a typed change goes, and keeps it on "Keep editing"', async () => {
    const onClose = jest.fn();
    await renderSheet(onClose);
    await fireEvent.changeText(screen.getByTestId('you-edit-name-field'), 'Ngọc Hân');

    const keep = answer('keep');
    await fireEvent.press(screen.getByTestId('you-edit-name-sheet-cancel'));
    expect(keep).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('you-edit-name-field').props.value).toBe('Ngọc Hân');
    keep.mockRestore();

    const discard = answer('discard');
    await fireEvent.press(screen.getByTestId('you-edit-name-sheet-cancel'));
    await Promise.resolve();
    expect(onClose).toHaveBeenCalledTimes(1);
    discard.mockRestore();
  });
});
