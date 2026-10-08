// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true, router: { back: () => undefined } }));

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { renderUi } from '@/ui/test-support/render';
import { ConsentSheet } from '../help/consent-sheet';
import {
  consentOf,
  markShareStopped,
  onOpen,
  pendingShare,
  shareView,
  unmarkShareStopped,
} from '../help/share-policy';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe('Help share consent', () => {
  it('asks on the first Help open and shares nothing until the answer', () => {
    expect(consentOf([])).toBe('unasked');
    expect(onOpen(consentOf([]))).toBe('ask');
  });

  it('shares on open only after a yes, and leaves it to a tap after a no or a revocation', () => {
    const yes = [{ granted_at: '2026-10-01T10:00:00Z', revoked_at: null }];
    const revoked = [{ granted_at: '2026-10-01T10:00:00Z', revoked_at: '2026-10-02T10:00:00Z' }];
    const no = [{ granted_at: null, revoked_at: '2026-10-01T10:00:00Z' }];
    expect(onOpen(consentOf(yes))).toBe('share');
    expect(onOpen(consentOf(revoked))).toBe('idle');
    expect(onOpen(consentOf(no))).toBe('idle');
  });

  it('shows the toggle off, and answers no unless the traveller turns it on', async () => {
    const onAnswer = jest.fn();
    await renderUi(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ConsentSheet crewName="Bali Six" onAnswer={onAnswer} />
      </SafeAreaProvider>,
    );
    const toggle = screen.getByRole('switch', { name: /Share where I am with Bali Six/ });
    expect(toggle.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(screen.getByTestId('help-consent-done'));
    await fireEvent.press(toggle);
    await fireEvent.press(screen.getByTestId('help-consent-done'));
    expect(onAnswer.mock.calls).toEqual([[false], [true]]);
  });
});

describe('Help share indicator', () => {
  const now = Date.parse('2026-10-02T09:00:00Z');

  it('shows a share started on this phone at once, without a share id to stop yet', () => {
    const view = shareView([], pendingShare('s1', now), now + 60_000);
    expect(view).toMatchObject({ shareId: null, minutesLeft: 59 });
  });

  it('prefers the synced share, and hides one that ended', () => {
    const synced = [{ id: 'share-1', ends_at: '2026-10-02T09:30:00Z' }];
    expect(shareView(synced, pendingShare('s1', now), now)).toMatchObject({
      shareId: 'share-1',
      minutesLeft: 30,
    });
    expect(shareView(synced, null, Date.parse('2026-10-02T09:31:00Z'))).toBeNull();
  });

  it('hides a share stopped on this phone while its row is still here, and shows it again when the stop was refused', () => {
    const synced = [{ id: 'share-stopped', ends_at: '2026-10-02T09:30:00Z' }];
    markShareStopped('share-stopped');
    expect(shareView(synced, null, now)).toBeNull();
    unmarkShareStopped('share-stopped');
    expect(shareView(synced, null, now)).toMatchObject({ shareId: 'share-stopped' });
  });
});
