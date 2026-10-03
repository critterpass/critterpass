import { describe, expect, it } from '@jest/globals';

import { replyPanelAfter, storyHeld } from '../trailer/story-hold';

describe('the trailer holds its story while a reply is open', () => {
  it('holds once the reply panel opens', () => {
    expect(storyHeld(replyPanelAfter(false, 'toggle'))).toBe(true);
  });

  it('carries on when the panel closes or a reply is sent', () => {
    expect(storyHeld(replyPanelAfter(true, 'toggle'))).toBe(false);
    expect(storyHeld(replyPanelAfter(true, 'sent'))).toBe(false);
  });

  it('plays on while no reply is open', () => {
    expect(storyHeld(false)).toBe(false);
  });
});
