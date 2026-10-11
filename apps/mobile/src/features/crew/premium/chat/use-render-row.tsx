/**
 * How each timeline row draws in the premium chat: a system line as a pill (the trip coming out
 * square as the settled strip), anything else as a message row with its colours, reply, reactions
 * and read count. The function only changes with the rows' own inputs.
 */
import { useCallback, useMemo } from 'react';

import type { TimelineRow } from '../../chat/components/timeline-rows';
import { systemLine } from '../../chat/components/system-line';
import type { ChatMessage } from '../../chat/data/rows';
import type { ReactionGroup } from '../../chat/data/use-reactions';
import { firstName } from '../../chat/data/use-typing';
import { SettledStrip, SystemPill } from './chat-chips';
import { PremiumMessageRow, type MessageRowHandlers } from './message-row';

const NO_GROUPS: readonly ReactionGroup[] = [];

export interface RenderRowInputs {
  readonly messages: readonly ChatMessage[];
  readonly openedSeq: number | null;
  readonly isMine: (message: ChatMessage) => boolean;
  readonly colourOf: (uid: string | null) => string;
  readonly guideName: string;
  readonly readBy: (seq: number | null) => number;
  readonly readOnly: boolean;
  readonly groups: ReadonlyMap<string, readonly ReactionGroup[]>;
  readonly handlers: MessageRowHandlers;
}

export function useRenderRow(inputs: RenderRowInputs) {
  const { messages, openedSeq, isMine, colourOf, guideName, readBy, readOnly, groups, handlers } =
    inputs;
  const byId = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
  return useCallback(
    (row: TimelineRow) => {
      if (row.kind !== 'message') return null;
      const { message } = row;
      if (message.senderKind === 'system') {
        if (message.refKind === 'trip_settled') {
          return <SettledStrip tripName={null} settled={Number(message.body) || 0} />;
        }
        return (
          <SystemPill
            text={systemLine(message.refKind, message.refName, message.body)}
            who={message.refName ?? null}
            color={colourOf(message.refId)}
          />
        );
      }
      const repliedTo = message.replyToId === null ? undefined : byId.get(message.replyToId);
      const mine = isMine(message);
      return (
        <PremiumMessageRow
          message={message}
          mine={mine}
          first={row.first}
          last={row.last}
          senderName={firstName(message.senderName) ?? message.senderName ?? ''}
          senderColor={colourOf(message.senderId)}
          guideName={guideName}
          readBy={mine ? readBy(message.seq) : 0}
          animate={openedSeq !== null && (message.seq === null || message.seq > openedSeq)}
          readOnly={readOnly}
          repliedTo={repliedTo}
          repliedToColor={repliedTo === undefined ? undefined : colourOf(repliedTo.senderId)}
          reactions={groups.get(message.id) ?? NO_GROUPS}
          handlers={handlers}
        />
      );
    },
    [byId, isMine, colourOf, guideName, readBy, openedSeq, readOnly, groups, handlers],
  );
}
