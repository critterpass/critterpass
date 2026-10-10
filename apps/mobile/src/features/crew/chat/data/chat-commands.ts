/**
 * Client specs for the crew chat commands. Every one may wait in the offline queue. A send's
 * summary carries its payload as values, so a message the server refused can be shown as failed
 * and sent again (RETRY) from the "didn't go through" row alone.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names and wire values, never copy. */
import type {
  EditMessagePayload,
  KeptChatPayload,
  MarkReadPayload,
  MessageIdPayload,
  MuteMemberPayload,
  PinMessagePayload,
  ReactMessagePayload,
  ReportMessagePayload,
  StickerPose,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

/** What the app sends; the server fills defaults and trims. */
export interface OutgoingMessage {
  readonly crew_id: string;
  readonly body: string;
  readonly mentions: readonly string[];
  readonly mentions_guide: boolean;
  readonly reply_to?: string;
  readonly attachments: readonly {
    readonly media_key: string;
    readonly kind: 'photo' | 'voice';
    readonly w?: number;
    readonly h?: number;
    readonly duration_ms?: number;
    readonly peaks?: readonly number[];
  }[];
  /** A critter sticker (a form the sender has met, in one pose) instead of text or media. */
  readonly sticker?: { readonly form_id: string; readonly pose: StickerPose };
}

export const SEND_MESSAGE = 'send_message';

export const sendMessageCommand = defineClientCommand<OutgoingMessage>({
  name: SEND_MESSAGE,
  offline: true,
  summarize: (payload) => ({
    ...(payload.sticker === undefined
      ? msg({ id: 'chat.queued.message', message: '“{preview}” to the crew chat' })
      : msg({ id: 'chat.queued.sticker', message: 'A sticker to the crew chat' })),
    values: { preview: payload.body.slice(0, 80), payload: JSON.stringify(payload) },
  }),
});

export const editMessageCommand = defineClientCommand<EditMessagePayload>({
  name: 'edit_message',
  offline: true,
  summarize: () => msg({ id: 'chat.queued.edit', message: 'Edit to a message' }),
});

export const deleteMessageCommand = defineClientCommand<MessageIdPayload>({
  name: 'delete_message',
  offline: true,
  summarize: () => msg({ id: 'chat.queued.delete', message: 'Deleting a message' }),
});

export const reactMessageCommand = defineClientCommand<ReactMessagePayload>({
  name: 'react_message',
  offline: true,
  summarize: (payload) => ({
    ...msg({ id: 'chat.queued.react', message: 'Reaction {emoji}' }),
    values: { emoji: payload.emoji },
  }),
});

export const markReadCommand = defineClientCommand<MarkReadPayload>({
  name: 'mark_read',
  offline: true,
});

export const reportMessageCommand = defineClientCommand<ReportMessagePayload>({
  name: 'report_message',
  offline: true,
  summarize: () => msg({ id: 'chat.queued.report', message: 'Report of a message' }),
});

export const muteMemberCommand = defineClientCommand<MuteMemberPayload>({
  name: 'mute_member',
  offline: true,
  summarize: (payload) =>
    payload.muted
      ? msg({ id: 'chat.queued.mute', message: 'Muting a crewmate' })
      : msg({ id: 'chat.queued.unmute', message: 'Unmuting a crewmate' }),
});

export const pinMessageCommand = defineClientCommand<PinMessagePayload>({
  name: 'pin_message',
  offline: true,
  summarize: (payload) =>
    payload.pinned
      ? msg({ id: 'chat.queued.pin', message: 'Pinning a message to the trip' })
      : msg({ id: 'chat.queued.unpin', message: 'Unpinning a message' }),
});

export const askToRejoinCommand = defineClientCommand<KeptChatPayload>({
  name: 'ask_to_rejoin',
  offline: true,
  summarize: () => msg({ id: 'chat.queued.askToRejoin', message: 'Asking to rejoin the crew' }),
});

export const removeKeptChatCommand = defineClientCommand<KeptChatPayload>({
  name: 'remove_kept_chat',
  offline: true,
  summarize: () => msg({ id: 'chat.queued.removeChat', message: 'Removing a crew chat' }),
});

/** The payload a failed send stored in its summary, or null when it cannot be read back. */
export function payloadFromSummary(summary: {
  readonly values?: Record<string, unknown>;
}): OutgoingMessage | null {
  const raw = summary.values?.['payload'];
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OutgoingMessage> | null;
    return parsed !== null && typeof parsed.crew_id === 'string' && typeof parsed.body === 'string'
      ? (parsed as OutgoingMessage)
      : null;
  } catch {
    return null;
  }
}
