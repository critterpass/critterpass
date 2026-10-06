/**
 * Client specs for the driver commands. Answering the card and cancelling may wait in the
 * offline queue; inviting and nudging need the server (they return the link and his number), and so does adding a
 * listed driver to the trip.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type {
  DriverInviteRefPayload,
  InviteDriverPayload,
  RateDriverPayload,
  ShortlistListedDriverPayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const rateDriverCommand = defineClientCommand<RateDriverPayload>({
  name: 'rate_driver',
  offline: true,
  summarize: () => msg({ id: 'drivers.queued.rate', message: 'Your answer about your driver' }),
});

export const inviteDriverCommand = defineClientCommand<InviteDriverPayload>({
  name: 'invite_driver',
  offline: false,
  summarize: () => msg({ id: 'drivers.queued.invite', message: 'Inviting your driver' }),
});

export const nudgeDriverInviteCommand = defineClientCommand<DriverInviteRefPayload>({
  name: 'nudge_driver_invite',
  offline: false,
  summarize: () => msg({ id: 'drivers.queued.nudge', message: 'Nudge to your driver' }),
});

export const cancelDriverInviteCommand = defineClientCommand<DriverInviteRefPayload>({
  name: 'cancel_driver_invite',
  offline: true,
  summarize: () => msg({ id: 'drivers.queued.cancel', message: 'Cancelling the invite' }),
});

export const shortlistListedDriverCommand = defineClientCommand<ShortlistListedDriverPayload>({
  name: 'shortlist_listed_driver',
  offline: false,
  summarize: () => msg({ id: 'drivers.queued.shortlist', message: 'Adding a driver to the trip' }),
});

export const reportContentCommand = defineClientCommand<{
  readonly kind: 'driver_listing' | 'driver_tip';
  readonly id: string;
  readonly reason: 'inaccurate' | 'personal_info' | 'spam' | 'harassment' | 'other';
}>({
  name: 'report_content',
  offline: true,
  summarize: () => msg({ id: 'drivers.queued.report', message: 'Your report' }),
});
