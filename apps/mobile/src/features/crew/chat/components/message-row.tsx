/**
 * One message of the timeline as the list draws it: the bubble with its reply quote, reaction chips
 * and what a press does. It is memoised and takes the message itself plus handlers that never
 * change, so a row is drawn again only when its own message, run position or reactions change, and
 * not when someone types, a sheet opens or another message lands.
 */
import { memo } from 'react';

import { ReplyQuote } from '../cards/reply-quote';
import type { ChatMessage } from '../data/rows';
import type { ReactionGroup } from '../data/use-reactions';
import { Bubble } from './bubble';
import { ReactionChips } from './reactions-sheet';

/** What a press on any row does; one object for the whole timeline, the same on every render. */
export interface MessageRowHandlers {
  readonly onRetry: (message: ChatMessage) => void;
  readonly onDiscard: (message: ChatMessage) => void;
  readonly onActions: (message: ChatMessage) => void;
  readonly onReply: (message: ChatMessage) => void;
  readonly onToggleReaction: (messageId: string, emoji: string) => void;
  readonly onShowReactions: (message: ChatMessage) => void;
}

export interface MessageRowProps {
  readonly message: ChatMessage;
  readonly mine: boolean;
  readonly first: boolean;
  readonly last: boolean;
  readonly joinIndex: number;
  readonly guideColor: string;
  readonly animate: boolean;
  /** A former member reads only: no reply, actions or reactions. */
  readonly readOnly: boolean;
  /** The message this one replies to, when it is in the loaded window. */
  readonly repliedTo: ChatMessage | undefined;
  readonly reactions: readonly ReactionGroup[];
  readonly handlers: MessageRowHandlers;
}

const NO_REACTIONS: readonly ReactionGroup[] = [];

export { NO_REACTIONS };

export const MessageRow = memo(function MessageRow(props: MessageRowProps) {
  const { message, mine, handlers, readOnly } = props;
  return (
    <Bubble
      message={message}
      mine={mine}
      first={props.first}
      last={props.last}
      joinIndex={props.joinIndex}
      guideColor={props.guideColor}
      animate={props.animate}
      onRetry={() => handlers.onRetry(message)}
      onDiscard={() => handlers.onDiscard(message)}
      {...(message.status === 'sent' && !readOnly
        ? {
            onActions: () => handlers.onActions(message),
            onReply: () => handlers.onReply(message),
          }
        : {})}
      {...(message.replyToId === null
        ? {}
        : {
            // A card's quote sits on a dark strip above it; a text bubble's inside the bubble.
            quote: (
              <ReplyQuote
                message={props.repliedTo}
                onDark={!mine || (message.type !== 'text' && !message.deleted)}
              />
            ),
          })}
      reactions={
        <ReactionChips
          groups={props.reactions}
          onToggle={(emoji) => {
            if (!readOnly) handlers.onToggleReaction(message.id, emoji);
          }}
          onShowAll={() => handlers.onShowReactions(message)}
        />
      }
    />
  );
});
