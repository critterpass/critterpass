/**
 * Sending from the composer: the message is queued locally (its op id becomes the message id) and
 * shows at once with a "sending" clock; the upload queue delivers it when there is a connection.
 * A refused send stays on screen as failed: RETRY queues it again as a new send, DELETE drops it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- draft problem codes, never copy. */
import { findUnsafeLink, MESSAGE_BODY_MAX } from '@cp/domain';
import { useCallback } from 'react';

import type { SendResult } from '@/data/commands/client';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { dismissRejected } from '@/data/status/use-rejected-commands';

import { sendMessageCommand, type OutgoingMessage } from './chat-commands';
import type { ChatMessage } from './rows';

export type Draft = Omit<OutgoingMessage, 'crew_id'>;

/** Why the composer refuses a draft before queuing it (the server refuses the same). */
export type DraftProblem = 'empty' | 'too_long' | 'unsafe_link' | null;

export function draftProblem(draft: Draft): DraftProblem {
  const body = draft.body.trim();
  if (body === '' && draft.attachments.length === 0) return 'empty';
  if (body.length > MESSAGE_BODY_MAX) return 'too_long';
  if (findUnsafeLink(body) !== null) return 'unsafe_link';
  return null;
}

/** The payload a failed timeline entry was sent with (for RETRY). */
export function draftOf(message: ChatMessage): Draft {
  return {
    body: message.body,
    mentions: message.mentions,
    mentions_guide: message.mentionsGuide,
    ...(message.replyToId === null ? {} : { reply_to: message.replyToId }),
    attachments: message.attachments.map((attachment) => ({
      media_key: attachment.media_key,
      kind: attachment.kind,
      ...(attachment.w === null ? {} : { w: attachment.w }),
      ...(attachment.h === null ? {} : { h: attachment.h }),
      ...(attachment.duration_ms === null ? {} : { duration_ms: attachment.duration_ms }),
      ...(attachment.peaks === undefined ? {} : { peaks: attachment.peaks }),
    })),
  };
}

export function useSendMessage(crewId: string) {
  const { db, commands } = useLocalFirst();

  const send = useCallback(
    async (draft: Draft): Promise<SendResult | null> => {
      if (draftProblem(draft) !== null) return null;
      return commands.send(sendMessageCommand, {
        ...draft,
        body: draft.body.trim(),
        crew_id: crewId,
      });
    },
    [commands, crewId],
  );

  const retry = useCallback(
    async (failed: ChatMessage): Promise<SendResult | null> => {
      const result = await send(draftOf(failed));
      if (result !== null) await dismissRejected(db, failed.id);
      return result;
    },
    [db, send],
  );

  const discard = useCallback((failed: ChatMessage) => dismissRejected(db, failed.id), [db]);

  return { send, retry, discard };
}
