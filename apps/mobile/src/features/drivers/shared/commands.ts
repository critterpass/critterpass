/** The driver commands the app sends (docs/api-contracts-suppliers.md §4.11). */
import type {
  AssignProviderPayload,
  ConfirmProviderFieldsPayload,
  DismissPickupGapPayload,
  ShareProviderIntakePayload,
  ShortlistProviderPayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const shareIntakeCommand = defineClientCommand<ShareProviderIntakePayload>({
  name: 'share_provider_intake',
  offline: true,
  summarize: () => msg({ id: 'drivers.queued.shared', message: 'A driver message you shared' }),
});

export const confirmFieldsCommand = defineClientCommand<ConfirmProviderFieldsPayload>({
  name: 'confirm_provider_fields',
  offline: false,
});

export const shortlistCommand = defineClientCommand<ShortlistProviderPayload>({
  name: 'shortlist_provider',
  offline: false,
});

export const assignCommand = defineClientCommand<AssignProviderPayload>({
  name: 'assign_provider',
  offline: false,
});

export const dismissGapCommand = defineClientCommand<DismissPickupGapPayload>({
  name: 'dismiss_pickup_gap',
  offline: true,
  summarize: () => msg({ id: 'drivers.queued.notNow', message: 'A day you said no driver for' }),
});
