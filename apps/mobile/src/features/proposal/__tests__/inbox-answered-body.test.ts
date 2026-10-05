import { describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { loadCatalog } from '@cp/i18n';

import type { InboxItem } from '@/features/home';

import { answeredBody } from '../inbox-answer-copy';

const item = (data: Record<string, unknown>): InboxItem => ({ data }) as unknown as InboxItem;

describe('the organiser reply card body', () => {
  it('asks for the lock only when the lock would go through', async () => {
    i18n.loadAndActivate({ locale: 'en', messages: await loadCatalog('en', 'proposal') });
    const ctx = { i18n, now: new Date() };
    const lockIt = 'Everyone has answered. Lock the trip to confirm it.';
    expect(answeredBody(item({ answered: 1, recipients: 2, going: 1, out: 0 }), ctx)).toBe(
      '1 of 2 answered so far.',
    );
    // A single maybe: everyone answered, nobody is in, so the lock would be refused.
    expect(answeredBody(item({ answered: 1, recipients: 1, going: 0, out: 0 }), ctx)).toBe(
      "Everyone has answered, but nobody is in yet. You can lock the trip once someone's in.",
    );
    expect(answeredBody(item({ answered: 2, recipients: 2, going: 1, out: 1 }), ctx)).toBe(lockIt);
    // Everyone out: the organiser locks in alone.
    expect(answeredBody(item({ answered: 2, recipients: 2, going: 0, out: 2 }), ctx)).toBe(lockIt);
    // Rows filed before the counts carried who is in read as before.
    expect(answeredBody(item({ answered: 1, recipients: 1 }), ctx)).toBe(lockIt);
  });

  it('says nobody is in yet in Vietnamese', async () => {
    i18n.loadAndActivate({ locale: 'vi', messages: await loadCatalog('vi', 'proposal') });
    const body = answeredBody(item({ answered: 1, recipients: 1, going: 0, out: 0 }), {
      i18n,
      now: new Date(),
    });
    expect(body).toContain('chưa ai nói đi');
  });
});
