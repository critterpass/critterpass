// The app's Reanimated double has no interpolation; the switch's knob and track take their first
// stop, run as UI-runtime functions like the double's own.
jest.mock('react-native-reanimated', () => {
  const runtime = jest.requireActual<{ registerUIRuntimeFunctions: (fns: unknown[]) => void }>(
    '@/motion/test-support/ui-runtime',
  );
  const interpolateColor = (_value: number, _input: readonly number[], output: readonly string[]) =>
    output[0];
  const interpolate = (_value: number, _input: readonly number[], output: readonly number[]) =>
    output[0];
  runtime.registerUIRuntimeFunctions([interpolateColor, interpolate]);
  return {
    ...jest.requireActual<Record<string, unknown>>('react-native-reanimated'),
    interpolateColor,
    interpolate,
  };
});

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { renderUi } from '@/lib/test-support/render-ui';
import { HelpConsent } from '../premium/HelpParts';
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

  it('asks once with two answers and shares only on yes', async () => {
    const onAnswer = jest.fn();
    await renderUi(
      <SafeAreaProvider initialMetrics={METRICS}>
        <HelpConsent crewName="Bali Six" onAnswer={onAnswer} />
      </SafeAreaProvider>,
    );
    expect(screen.getByText(/show Bali Six where you are/u)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('help-consent-not-now'));
    await fireEvent.press(screen.getByTestId('help-consent-share'));
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
