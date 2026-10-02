/**
 * Client specs for Home's commands. Inbox actions, mark-read, tip dismissal and app-open counts may
 * wait in the offline queue; a nudge is sent online so the sender learns at once when it lands
 * (or that the share sheet is theirs to use), and so is joining a trip that is already locked in.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type {
  ActInboxItemPayload,
  MarkInboxReadPayload,
  RecordAppOpenPayload,
  SendNudgePayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const ACT_INBOX_ITEM = 'act_inbox_item';

export const actInboxItemCommand = defineClientCommand<ActInboxItemPayload>({
  name: ACT_INBOX_ITEM,
  offline: true,
  summarize: () => msg({ id: 'home.queued.inboxAction', message: 'Your answer in the inbox' }),
});

export const markInboxReadCommand = defineClientCommand<MarkInboxReadPayload>({
  name: 'mark_inbox_read',
  offline: true,
});

export const DISMISS_TIP = 'dismiss_tip';

export const dismissTipCommand = defineClientCommand<{ tip_id: string }>({
  name: DISMISS_TIP,
  offline: true,
});

export const recordAppOpenCommand = defineClientCommand<RecordAppOpenPayload>({
  name: 'record_app_open',
  offline: true,
});

export const sendNudgeCommand = defineClientCommand<SendNudgePayload>({
  name: 'send_nudge',
  offline: false,
});

/** Online only: the seat (or the waitlist place) is the server's to give. */
export const joinTripCommand = defineClientCommand<{ trip_id: string }>({
  name: 'join_trip',
  offline: false,
});
