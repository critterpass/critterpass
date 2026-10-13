/**
 * The premium chat's card registry: every non-text message kind draws through the renderer
 * registered for it here (photos, voice notes, polls, guide offers, expenses, change sets,
 * proposals, meet-ups, rides, boosts), and anything this build does not know draws the
 * "unknown" card, so an old app never crashes on a newer card.
 */
import type { ReactNode } from 'react';

import type { ChatMessage } from '../../../chat/data/rows';

/** What a chat card component is given. */
export interface ChatCardProps {
  readonly message: ChatMessage;
  readonly mine: boolean;
}

export interface PremiumChatCard {
  readonly render: (message: ChatMessage, mine: boolean) => ReactNode;
}

const cards = new Map<string, PremiumChatCard>();

/** Registers the card for a message kind; returns a function that takes it away again. */
export function registerPremiumChatCard(type: string, card: PremiumChatCard): () => void {
  cards.set(type, card);
  return () => {
    if (cards.get(type) === card) cards.delete(type);
  };
}

export function premiumCard(type: string): PremiumChatCard | undefined {
  return cards.get(type);
}
