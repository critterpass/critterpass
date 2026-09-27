import { describe, expect, it } from 'vitest';

import { defaultBotFilterConfig, isBotRequest } from '../../src/abuse/bot-filter';

describe('isBotRequest', () => {
  it('classifies a known link-preview crawler as a bot', () => {
    expect(
      isBotRequest(
        { userAgent: 'WhatsApp/2.24.1 A', ip: '203.0.113.10' },
        defaultBotFilterConfig(),
      ),
    ).toBe(true);
    expect(
      isBotRequest(
        { userAgent: 'facebookexternalhit/1.1', ip: '203.0.113.10' },
        defaultBotFilterConfig(),
      ),
    ).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isBotRequest({ userAgent: 'TelegramBot (like TwitterBot)', ip: undefined })).toBe(true);
  });

  it('does not classify a normal mobile app user agent as a bot', () => {
    expect(
      isBotRequest({ userAgent: 'CFNetwork/1498.700.2 Darwin/23.6.0', ip: '203.0.113.11' }),
    ).toBe(false);
  });

  it('classifies a configured blocked IP as a bot regardless of user agent', () => {
    const config = { userAgentSubstrings: [], blockedIps: ['198.51.100.5'] };
    expect(isBotRequest({ userAgent: 'anything', ip: '198.51.100.5' }, config)).toBe(true);
  });

  it('handles a missing user agent and missing ip without throwing', () => {
    expect(isBotRequest({ userAgent: undefined, ip: undefined })).toBe(false);
  });
});
