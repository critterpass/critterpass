import { describe, expect, it } from 'vitest';

import {
  feedbackSendable,
  hasBlockedWord,
  ideaVoteMonth,
  ideaVotesLeft,
  submitFeedbackPayloadSchema,
} from '../../src/help';

describe('the vote budget month', () => {
  it('follows the voter’s own calendar across midnight on the last day', () => {
    const at = new Date('2026-10-31T18:30:00Z');
    expect(ideaVoteMonth(at, 'Asia/Ho_Chi_Minh')).toBe('2026-11');
    expect(ideaVoteMonth(at, 'America/Los_Angeles')).toBe('2026-10');
  });

  it('never goes below zero votes left', () => {
    expect(ideaVotesLeft(3)).toBe(7);
    expect(ideaVotesLeft(12)).toBe(0);
  });
});

describe('blocked words in an idea', () => {
  it('matches whole words, and long words inside others, ignoring accents and case', () => {
    expect(hasBlockedWord('A DÚMMY idea', ['dummy'])).toBe(true);
    expect(hasBlockedWord('superdummyish lists', ['dummy'])).toBe(true);
    expect(hasBlockedWord('Assets per crew', ['ass'])).toBe(false);
    expect(hasBlockedWord('Kiss my ass', ['ass'])).toBe(true);
  });
});

describe('sending feedback', () => {
  it('takes three characters of text, or a mood with a topic', () => {
    expect(feedbackSendable({ text: ' ok ', mood: null, category: null })).toBe(false);
    expect(feedbackSendable({ text: 'nice', mood: null, category: null })).toBe(true);
    expect(feedbackSendable({ text: '', mood: 'love', category: null })).toBe(false);
    expect(feedbackSendable({ text: '', mood: 'love', category: 'money' })).toBe(true);
  });

  it('refuses device info the sender turned off', () => {
    const base = { id: '0199a3f0-0000-7000-8000-000000000001', text: 'hello there' };
    const device = {
      os: 'iOS',
      os_version: '26',
      app_version: '1.0.0',
      build: '16',
      model: 'iPhone',
      locale: 'en',
      tz: 'UTC',
      network: 'wifi',
    };
    expect(
      submitFeedbackPayloadSchema.safeParse({
        ...base,
        include_device_info: false,
        device_info: device,
      }).success,
    ).toBe(false);
    expect(
      submitFeedbackPayloadSchema.safeParse({
        ...base,
        include_device_info: true,
        device_info: device,
      }).success,
    ).toBe(true);
  });
});
