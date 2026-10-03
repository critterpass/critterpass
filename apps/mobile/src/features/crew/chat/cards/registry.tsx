/**
 * The chat's card registry: every `messages.type` beyond plain text renders through the renderer
 * its owning feature registers here (photos and voice notes from the chat's media, polls, expenses,
 * guide offers, change sets, boost cards, meet-ups, proposals and supplier orders from their own
 * areas). The chat never names a card type itself; a type nobody registered, or one this build does
 * not know, renders the neutral "needs a newer app" card and never crashes.
 *
 *   registerChatCard('poll', {
 *     Component: PollCard,
 *     estimateHeight: (message) => 180,
 *     a11yLabel: (message) => t`Poll: ${message.body}`,
 *   });
 */
import { MESSAGE_TYPES, type MessageType } from '@cp/domain';
import { createElement, type ComponentType, type ReactNode } from 'react';

import type { ChatMessage } from '../data/rows';
import { UnknownCard } from './unknown-card';

export interface ChatCardProps {
  readonly message: ChatMessage;
  readonly mine: boolean;
}

export interface ChatCardRenderer {
  readonly Component: ComponentType<ChatCardProps>;
  /** Height the list reserves before the card lays out (virtualisation hint). */
  readonly estimateHeight: (message: ChatMessage) => number;
  /** What a screen reader says for the card. */
  readonly a11yLabel: (message: ChatMessage) => string;
}

/** Types the chat draws itself, never through the registry. */
const BUILT_IN: ReadonlySet<string> = new Set<MessageType>(['text', 'system']);

const renderers = new Map<string, ChatCardRenderer>();

export function registerChatCard(type: MessageType, renderer: ChatCardRenderer): () => void {
  if (BUILT_IN.has(type)) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- developer-facing error, never copy.
    throw new Error(`${type} messages are drawn by the chat itself`);
  }
  renderers.set(type, renderer);
  return () => {
    if (renderers.get(type) === renderer) renderers.delete(type);
  };
}

export function chatCard(type: string): ChatCardRenderer | undefined {
  return renderers.get(type);
}

export function isKnownType(type: string): type is MessageType {
  return (MESSAGE_TYPES as readonly string[]).includes(type);
}

/** The body of a non-text message: its registered card, or the fallback. */
export function renderCard(message: ChatMessage, mine: boolean): ReactNode {
  const renderer = chatCard(message.type);
  if (renderer === undefined) return createElement(UnknownCard, { message });
  return createElement(renderer.Component, { message, mine });
}
