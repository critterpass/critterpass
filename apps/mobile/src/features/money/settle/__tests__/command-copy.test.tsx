/**
 * What a settle-up action says when its command answers: with no signal every online action says
 * so (never its success line, never "already nudged"), and the once-a-day lines are said only when
 * the server refuses for that reason.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { toastQueue, useCommandFeedback } from '@/motion/island-toast';

import { useSettleCopy, type SettleAction } from '../command-copy';

jest.mock('@/motion/feedback', () => ({ impact: jest.fn() }));

function wrapper({ children }: { readonly children: ReactNode }) {
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}

async function hooks() {
  const { result } = await renderHook(
    () => ({ copy: useSettleCopy(), report: useCommandFeedback().report }),
    { wrapper },
  );
  return result.current;
}

const NEEDS_SIGNAL = 'Needs signal. Try again when you’re back online.';
const ONLINE_ONLY: readonly SettleAction[] = ['request', 'confirm', 'dispute', 'nudge', 'remind'];

beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  toastQueue.resetForTests();
});

describe('settle-up command answers', () => {
  it.each(ONLINE_ONLY)('says %s needs signal when the server was not reached', async (action) => {
    const { copy, report } = await hooks();
    expect(report({ kind: 'unavailable' }, copy(action, 'Maya'))).toBe('needs-signal');
    expect(toastQueue.getCurrent()?.title).toBe(NEEDS_SIGNAL);
  });

  it('says "already nudged today" only when the server refuses for that reason', async () => {
    const { copy, report } = await hooks();
    report({ kind: 'rejected', code: 'NUDGE_TOO_SOON' }, copy('nudge', 'Maya'));
    expect(toastQueue.getCurrent()?.title).toBe('Already nudged today. Try tomorrow.');
    toastQueue.resetForTests();
    report({ kind: 'rejected', code: 'FORBIDDEN' }, copy('nudge', 'Maya'));
    expect(toastQueue.getCurrent()?.title).toBe('That didn’t go through.');
  });

  it('says everyone was reminded today only when the server refuses for that reason', async () => {
    const { copy, report } = await hooks();
    report({ kind: 'rejected', code: 'RATE_LIMITED' }, copy('remind'));
    expect(toastQueue.getCurrent()?.title).toBe('Everyone got a reminder today already.');
    toastQueue.resetForTests();
    report({ kind: 'rejected', code: 'STATE_INVALID' }, copy('remind'));
    expect(toastQueue.getCurrent()?.title).toBe('That didn’t go through.');
  });

  it('names the person once an action went through', async () => {
    const { copy, report } = await hooks();
    expect(report({ kind: 'applied' }, copy('nudge', 'Maya'))).toBe('done');
    expect(toastQueue.getCurrent()?.title).toBe('Nudged Maya. Gently.');
    toastQueue.resetForTests();
    report({ kind: 'applied' }, copy('dispute', 'Maya'));
    expect(toastQueue.getCurrent()?.title).toBe("Told Maya it didn't arrive.");
  });

  it('counts a mark kept on the phone as done, and a queued request as not sent', async () => {
    const { copy, report } = await hooks();
    expect(report({ kind: 'queued' }, copy('markPaid'))).toBe('queued');
    expect(toastQueue.getCurrent()?.title).toBe('Marked paid. They confirm when it lands.');
    toastQueue.resetForTests();
    expect(report({ kind: 'queued' }, copy('request', 'Maya'))).toBe('queued');
    expect(toastQueue.getCurrent()).toBeNull();
  });
});
