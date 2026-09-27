import { guardAnalyticsEvent } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { createWebAnalytics } from './client';

function capture() {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const analytics = createWebAnalytics({
    apiKey: 'phc_test',
    send: (url, body) => sent.push({ url, body: JSON.parse(body) as Record<string, unknown> }),
  });
  return { analytics, sent };
}

describe('web analytics', () => {
  it('sends an anonymous page view with the route only', () => {
    const { analytics, sent } = capture();
    analytics.pageview('https://critterpass.app/i/AB12CD/seat?c=wa', 'https://wa.me/some/chat');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe('https://eu.i.posthog.com/i/v0/e/');
    expect(sent[0]?.body).toMatchObject({
      event: '$pageview',
      distinct_id: expect.stringMatching(/^web_/u) as unknown,
      properties: {
        $current_url: 'https://critterpass.app/i/:code',
        $pathname: '/i/:code',
        $referring_domain: 'wa.me',
        $process_person_profile: false,
        surface: 'web',
      },
    });
    expect(JSON.stringify(sent)).not.toContain('AB12CD');
  });

  it('sends catalog-valid CTA clicks and ignores free text', () => {
    const { analytics, sent } = capture();
    analytics.cta('join_waitlist');
    analytics.cta('Join the waitlist now!');
    expect(sent.map((item) => item.body['event'])).toEqual(['cta_clicked']);
    const {
      $process_person_profile: _p,
      $lib: _l,
      ...props
    } = sent[0]?.body['properties'] as Record<string, unknown>;
    expect(guardAnalyticsEvent('cta_clicked', props)).toMatchObject({ ok: true });
  });

  it('sends nothing without a project key', () => {
    const sent: string[] = [];
    createWebAnalytics({ apiKey: undefined, send: (_url, body) => sent.push(body) }).cta(
      'join_waitlist',
    );
    expect(sent).toEqual([]);
  });
});
