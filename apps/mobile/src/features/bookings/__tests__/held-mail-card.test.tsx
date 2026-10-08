import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ThemeProvider } from '../../../lib/theme';
import { HeldMailCard } from '../link-code/HeldMailCard';
import { linkCodeWasSent } from '../link-code/link-code-model';

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

async function card(codeSent: boolean) {
  const onLink = jest.fn();
  const onPaste = jest.fn();
  await render(
    <GestureHandlerRootView>
      <I18nProvider i18n={i18n}>
        <ThemeProvider>
          <HeldMailCard count={3} codeSent={codeSent} onLink={onLink} onPaste={onPaste} />
        </ThemeProvider>
      </I18nProvider>
    </GestureHandlerRootView>,
  );
  return { onLink, onPaste };
}

const NOW = new Date('2026-10-02T10:00:00Z');

describe('held mail', () => {
  it('asks for the code only while one that was emailed is still good', () => {
    expect(linkCodeWasSent('2026-10-03 00:23:00.123456Z', NOW)).toBe(true);
    expect(linkCodeWasSent('2026-10-03T00:23:00Z', NOW)).toBe(true);
    expect(linkCodeWasSent('2026-10-02 09:59:59Z', NOW)).toBe(false);
    expect(linkCodeWasSent(null, NOW)).toBe(false);
    expect(linkCodeWasSent(undefined, NOW)).toBe(false);
    expect(linkCodeWasSent('not a time', NOW)).toBe(false);
  });

  it('opens the code sheet when a code was sent', async () => {
    const { onLink, onPaste } = await card(true);
    await fireEvent.press(screen.getByTestId('bookings-held-mail-enter'));
    expect(onLink).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('bookings-held-mail-paste')).toBeNull();
    expect(onPaste).not.toHaveBeenCalled();
  });

  it('offers paste, and never a code, when none went out', async () => {
    const { onLink, onPaste } = await card(false);
    expect(screen.queryByTestId('bookings-held-mail-enter')).toBeNull();
    await fireEvent.press(screen.getByTestId('bookings-held-mail-paste'));
    expect(onPaste).toHaveBeenCalledTimes(1);
    expect(onLink).not.toHaveBeenCalled();
  });
});
