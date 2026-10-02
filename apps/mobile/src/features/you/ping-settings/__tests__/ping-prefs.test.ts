import { describe, expect, it } from '@jest/globals';

import { DEFAULT_PING_PREFS, payloadFor, prefsFromRow } from '../ping-prefs';
import { sampleBand } from '../ping-sample';

describe('ping prefs from the synced row', () => {
  it('uses the product defaults until the person has a row', () => {
    expect(prefsFromRow(undefined)).toEqual(DEFAULT_PING_PREFS);
    expect(DEFAULT_PING_PREFS.budget).toBe(10);
  });

  it('reads synced times as clocks and synced integers as switches', () => {
    expect(
      prefsFromRow({
        budget_per_day: 3,
        roundup_time: '19:30:00',
        quiet_from: '23:00:00',
        quiet_to: '06:30:00',
        guide_tips: 0,
        crew_chat_mode: 'mentions',
        money: 1,
        critters_nearby: 0,
      }),
    ).toEqual({
      budget: 3,
      roundupTime: '19:30',
      quietFrom: '23:00',
      quietTo: '06:30',
      guideTips: false,
      crewChat: 'mentions',
      money: true,
      crittersNearby: false,
    });
  });

  it('falls back on values this build does not know', () => {
    const prefs = prefsFromRow({
      budget_per_day: 40,
      roundup_time: null,
      quiet_from: 'late',
      quiet_to: null,
      guide_tips: null,
      crew_chat_mode: 'loud',
      money: null,
      critters_nearby: null,
    });
    expect(prefs).toEqual({ ...DEFAULT_PING_PREFS, budget: 10 });
  });
});

describe('the patch a change sends', () => {
  it('sends only what changed, in the command’s field names', () => {
    expect(payloadFor({ budget: 3 }, DEFAULT_PING_PREFS)).toEqual({ budget: 3 });
    expect(payloadFor({ crewChat: 'off', money: false }, DEFAULT_PING_PREFS)).toEqual({
      crew_chat: 'off',
      money: false,
    });
    expect(payloadFor({ roundupTime: '19:00' }, DEFAULT_PING_PREFS)).toEqual({
      roundup_time: '19:00',
    });
  });

  it('keeps the budget inside what the server accepts', () => {
    expect(payloadFor({ budget: 0 }, DEFAULT_PING_PREFS)).toEqual({ budget: 1 });
    expect(payloadFor({ budget: 14 }, DEFAULT_PING_PREFS)).toEqual({ budget: 10 });
  });

  it('sends quiet hours as a pair even when one end moves', () => {
    expect(payloadFor({ quietTo: '08:00' }, DEFAULT_PING_PREFS)).toEqual({
      quiet: { from: '22:00', to: '08:00' },
    });
  });
});

describe('the spoken sample', () => {
  it('describes a quiet, a steady and a chatty day', () => {
    expect([1, 3, 4, 7, 8, 10].map(sampleBand)).toEqual([
      'quiet',
      'quiet',
      'steady',
      'steady',
      'chatty',
      'chatty',
    ]);
  });
});
