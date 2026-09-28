/**
 * What a member can do with one message, and the commands behind each: react, reply, copy, edit
 * (own text within the edit window), delete (own, any time), report (someone else's) and mute its
 * sender (hides their messages on the member's own devices). Every write goes through the offline
 * queue.
 */
import { CHAT_EDIT_WINDOW_MINUTES, type ReportReason } from '@cp/domain';
import { useCallback } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

import {
  deleteMessageCommand,
  editMessageCommand,
  muteMemberCommand,
  reportMessageCommand,
} from './chat-commands';
import type { ChatMessage } from './rows';

export type MessageAction = 'reply' | 'copy' | 'edit' | 'delete' | 'report' | 'mute';

/** Actions offered for `message`, in menu order. */
export function actionsFor(
  message: ChatMessage,
  me: string,
  now: number = Date.now(),
  editWindowMinutes: number = CHAT_EDIT_WINDOW_MINUTES,
): MessageAction[] {
  if (message.deleted || message.status !== 'sent' || message.senderKind === 'system') return [];
  const mine = message.senderKind === 'user' && message.senderId === me;
  const actions: MessageAction[] = ['reply'];
  if (message.body !== '') actions.push('copy');
  if (mine) {
    const age = now - Date.parse(message.createdAt);
    if (message.type === 'text' && age <= editWindowMinutes * 60_000) actions.push('edit');
    actions.push('delete');
  } else if (message.senderKind === 'user') {
    actions.push('report', 'mute');
  }
  return actions;
}

export function useMessageActions(crewId: string) {
  const { commands } = useLocalFirst();
  const edit = useCallback(
    (message: ChatMessage, body: string) =>
      commands.send(editMessageCommand, { message_id: message.id, body }),
    [commands],
  );
  const remove = useCallback(
    (message: ChatMessage) => commands.send(deleteMessageCommand, { message_id: message.id }),
    [commands],
  );
  const report = useCallback(
    (message: ChatMessage, reason: ReportReason) =>
      commands.send(reportMessageCommand, { message_id: message.id, reason }),
    [commands],
  );
  const mute = useCallback(
    (uid: string, muted: boolean) =>
      commands.send(muteMemberCommand, { crew_id: crewId, uid, muted }),
    [commands, crewId],
  );
  return { edit, remove, report, mute };
}
