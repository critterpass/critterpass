import { describe, expect, it } from '@jest/globals';

import {
  activeConversationOf,
  conversationOfTap,
  foregroundBehavior,
  shouldPresentInForeground,
} from '../foreground';
import type { PushTap } from '../routing';

const CREW = '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b02';
const OTHER = '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b03';

function chat(overrides: Partial<PushTap> = {}): PushTap {
  return {
    nid: '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b09',
    deeplink: `/crew/${CREW}/chat`,
    type: 'crew_chat',
    crewId: CREW,
    ...overrides,
  };
}

describe('the conversation on screen', () => {
  it.each([
    [`/crew/${CREW}/chat`, CREW],
    [`/crew/${CREW}/chat/`, CREW],
    [`/crew/${CREW}/chat?focus=1`, CREW],
    [`/crew/${CREW}/settings`, null],
    ['/crew', null],
    ['/', null],
    [`/crew/${CREW}/chatter`, null],
  ])('%s → %p', (pathname, expected) => {
    expect(activeConversationOf(pathname)).toBe(expected);
  });
});

describe('the conversation a push belongs to', () => {
  it('is the crew of a chat push', () => {
    expect(conversationOfTap(chat())).toBe(CREW);
  });

  it('comes from the chat link when the crew is missing', () => {
    expect(conversationOfTap(chat({ crewId: null }))).toBe(CREW);
    expect(
      conversationOfTap(chat({ crewId: null, deeplink: `critterpass://crew/${CREW}/chat` })),
    ).toBe(CREW);
  });

  it('is none for anything other than chat', () => {
    expect(conversationOfTap(chat({ type: 'vote_needs_you' }))).toBeNull();
  });
});

describe('foreground presentation', () => {
  it('hides a chat push for the chat on screen', () => {
    expect(shouldPresentInForeground(chat(), `/crew/${CREW}/chat`)).toBe(false);
  });

  it('shows a chat push for another crew, or while elsewhere in the app', () => {
    expect(shouldPresentInForeground(chat(), `/crew/${OTHER}/chat`)).toBe(true);
    expect(shouldPresentInForeground(chat(), '/')).toBe(true);
  });

  it('shows other pushes on the chat screen, and pushes that are not ours', () => {
    expect(shouldPresentInForeground(chat({ type: 'vote_needs_you' }), `/crew/${CREW}/chat`)).toBe(
      true,
    );
    expect(shouldPresentInForeground(null, `/crew/${CREW}/chat`)).toBe(true);
  });

  it('maps the decision to a banner, list entry and sound together, never the badge', () => {
    expect(foregroundBehavior(true)).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
    expect(foregroundBehavior(false)).toMatchObject({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
    });
  });
});
