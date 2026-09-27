import { describe, expect, it } from 'vitest';

import { isHumanLinkOpen } from '../../src/links/bot-filter';
import { hashForLog, redactLinkPath } from '../../src/links/redact';

// Real user agents as sent by each app's link-preview fetcher and by real browsers.
const PREVIEW_FETCHERS = {
  whatsapp: 'WhatsApp/2.24.20.80 A',
  imessage:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0',
  slack: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  telegram: 'TelegramBot (like TwitterBot)',
  discord: 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
};
const PEOPLE = {
  safariIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  instagramInApp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0',
};

function open(userAgent: string | undefined, extra: { method?: string; purpose?: string } = {}) {
  return isHumanLinkOpen({
    method: extra.method ?? 'GET',
    userAgent,
    ip: '203.0.113.9',
    purpose: extra.purpose,
  });
}

describe('isHumanLinkOpen', () => {
  it.each(Object.entries(PREVIEW_FETCHERS))('never counts the %s unfurl as an open', (_, ua) => {
    expect(open(ua)).toBe(false);
  });

  it.each(Object.entries(PEOPLE))('counts %s as a person', (_, ua) => {
    expect(open(ua)).toBe(true);
  });

  it('never counts HEAD probes, prefetches or requests without a user agent', () => {
    expect(open(PEOPLE.safariIos, { method: 'HEAD' })).toBe(false);
    expect(open(PEOPLE.chromeAndroid, { purpose: 'prefetch;prerender' })).toBe(false);
    expect(open(undefined)).toBe(false);
    expect(open('   ')).toBe(false);
  });
});

describe('redactLinkPath', () => {
  it('hashes the code or token segment of link routes and leaves other paths alone', () => {
    expect(redactLinkPath('/v1/links/K7M2QX/preview')).toBe(
      `/v1/links/${hashForLog('K7M2QX')}/preview`,
    );
    expect(redactLinkPath('/v1/codes/K7M2QX')).toBe(`/v1/codes/${hashForLog('K7M2QX')}`);
    expect(redactLinkPath('/v1/codes/K7M2QX')).not.toContain('K7M2QX');
    expect(redactLinkPath('/v1/cmd/claim_attribution')).toBe('/v1/cmd/claim_attribution');
  });
});
