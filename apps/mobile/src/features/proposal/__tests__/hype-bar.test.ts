import { i18n } from '@lingui/core';
import { beforeAll, describe, expect, it } from '@jest/globals';

import { crewInLine, crewInPct } from '../your-version/hype-bar';

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('crew hype', () => {
  it('counts the organiser as in, so one of two recipients boarding is two of three', () => {
    expect(crewInPct({ pct: 0, reacted: 0, boarded: 0, recipients: 2 })).toBe(33);
    expect(crewInPct({ pct: 50, reacted: 0, boarded: 1, recipients: 2 })).toBe(67);
    expect(crewInPct({ pct: 100, reacted: 0, boarded: 1, recipients: 1 })).toBe(100);
  });

  it('never reads full because someone sent a quick reply before answering', () => {
    // The server counts a reaction toward its figure; the bar here counts only who is in.
    const reacted = { pct: 100, reacted: 1, boarded: 0, recipients: 1 };
    expect(crewInPct(reacted)).toBe(50);
    expect(crewInPct({ ...reacted, boarded: 1 })).toBe(100);
  });

  it('is empty with nobody to count, and never passes full on more boarded than recipients', () => {
    expect(crewInPct(null)).toBe(0);
    expect(crewInPct({ pct: 0, reacted: 0, boarded: 0, recipients: 0 })).toBe(0);
    expect(crewInPct({ pct: 100, reacted: 0, boarded: 3, recipients: 1 })).toBe(100);
  });

  it('words a crew of two without ever reading "0 of 1"', () => {
    expect(crewInLine(0, 1, 'Linh')).toBe('Only Linh is in so far.');
    expect(crewInLine(0, 2, '')).toBe('Nobody has answered yet.');
    expect(crewInLine(1, 1, 'Linh')).toBe('2 of 2 in the crew are in.');
    expect(crewInLine(1, 3, '')).toBe('2 of 4 in the crew are in.');
  });
});
