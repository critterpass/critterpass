/**
 * Reporting a command's result shows one toast that fits what happened and returns the outcome: the
 * caller's success line when it went through (or was kept on the phone for an offline-capable
 * action), "Needs signal" when the server could not be reached, and the refusal's own line.
 */
import { renderHook } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import type { ReactNode } from 'react';

import { useCommandFeedback } from '../command-feedback';
import { toastQueue } from '../queue';

const mockImpact = jest.fn();
jest.mock('../../feedback', () => ({ impact: (cue: string) => mockImpact(cue) }));

const OP = '01900000-0000-7000-8000-000000000001';

function wrapper({ children }: { readonly children: ReactNode }) {
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}

async function feedback() {
  const { result } = await renderHook(() => useCommandFeedback(), { wrapper });
  return result.current;
}

beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  toastQueue.resetForTests();
  mockImpact.mockClear();
});

describe('useCommandFeedback', () => {
  it('shows the success line for an applied command', async () => {
    const { report } = await feedback();
    const outcome = report({ kind: 'applied', opId: OP, result: null }, { done: 'Saved' });
    expect(outcome).toBe('done');
    expect(toastQueue.getCurrent()?.title).toBe('Saved');
    expect(mockImpact).toHaveBeenCalledWith('success');
  });

  it('stays quiet on success when the caller gives no line', async () => {
    const { report } = await feedback();
    expect(report({ kind: 'applied', opId: OP, result: null })).toBe('done');
    expect(toastQueue.getCurrent()).toBeNull();
    expect(mockImpact).not.toHaveBeenCalled();
  });

  it('counts a queued send as done only for an offline-capable action', async () => {
    const { report } = await feedback();
    expect(report({ kind: 'queued', opId: OP }, { done: 'Saved' })).toBe('queued');
    expect(toastQueue.getCurrent()).toBeNull();

    expect(report({ kind: 'queued', opId: OP }, { done: 'Saved', offlineCapable: true })).toBe(
      'queued',
    );
    expect(toastQueue.getCurrent()?.title).toBe('Saved');
    expect(mockImpact).toHaveBeenCalledWith('success');
  });

  it('says it needs signal when the server could not be reached', async () => {
    const { report } = await feedback();
    const outcome = report({ kind: 'unavailable', opId: OP, code: 'NETWORK' }, { done: 'Saved' });
    expect(outcome).toBe('needs-signal');
    expect(toastQueue.getCurrent()?.title).toBe('Needs signal. Try again when you’re back online.');
    expect(mockImpact).toHaveBeenCalledWith('warning');
  });

  it('lets the caller name the step to retry when offline', async () => {
    const { report } = await feedback();
    report(
      { kind: 'unavailable', opId: OP, code: 'NETWORK' },
      { needsSignal: 'Try SPLIT IT again' },
    );
    expect(toastQueue.getCurrent()?.title).toBe('Try SPLIT IT again');
  });

  it("shows the caller's line for the refusal's error code", async () => {
    const { report } = await feedback();
    const outcome = report(
      { kind: 'rejected', opId: OP, code: 'NUDGE_TOO_SOON' },
      { refused: { NUDGE_TOO_SOON: 'You nudged them a moment ago.' } },
    );
    expect(outcome).toBe('refused');
    expect(toastQueue.getCurrent()?.title).toBe('You nudged them a moment ago.');
    expect(mockImpact).toHaveBeenCalledWith('error');
  });

  it('falls back to a plain refusal line for a code the caller did not name', async () => {
    const { report } = await feedback();
    report(
      { kind: 'rejected', opId: OP, code: 'FORBIDDEN' },
      { refused: { NUDGE_TOO_SOON: 'You nudged them a moment ago.' } },
    );
    expect(toastQueue.getCurrent()?.title).toBe('That didn’t go through.');
  });

  it('uses one refusal line for every code when the caller gives a single line', async () => {
    const { report } = await feedback();
    report(
      { kind: 'rejected', opId: OP, code: 'FORBIDDEN' },
      { refused: 'Try again, or type it in.' },
    );
    expect(toastQueue.getCurrent()?.title).toBe('Try again, or type it in.');
  });
});
