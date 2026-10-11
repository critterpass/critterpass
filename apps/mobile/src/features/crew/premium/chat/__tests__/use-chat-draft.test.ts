import { describe, expect, it } from '@jest/globals';

import { callsGuide } from '../use-chat-draft';

describe('callsGuide', () => {
  it('flags @tokek in any case', () => {
    expect(callsGuide('hey @Tokek where for dinner?', null)).toBe(true);
  });

  it("flags the crew's own guide by name", () => {
    expect(callsGuide('@pon is it raining?', 'Pon')).toBe(true);
  });

  it('leaves a message that only mentions the name without @ alone', () => {
    expect(callsGuide('tokek said so', 'Tokek')).toBe(false);
    expect(callsGuide('email me at a@tokekx.com', null)).toBe(false);
  });
});
