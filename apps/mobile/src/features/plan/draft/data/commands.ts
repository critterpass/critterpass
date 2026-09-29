/**
 * Client specs for the drafting commands (docs/api-contracts.md §4.6). Starting or cancelling a
 * draft and asking for a redraft need the server's answer there and then (a job id, the quota);
 * keeping or putting back a redraft and restoring an earlier draft wait in the offline queue.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type {
  CancelDraftPayload,
  KeepRedraftPayload,
  RequestRedraftPayload,
  RestoreDraftVersionPayload,
  RevertRedraftPayload,
  StartDraftPayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const startDraftCommand = defineClientCommand<StartDraftPayload>({
  name: 'start_draft',
  offline: false,
});

export const cancelDraftCommand = defineClientCommand<CancelDraftPayload>({
  name: 'cancel_draft',
  offline: false,
});

export const requestRedraftCommand = defineClientCommand<RequestRedraftPayload>({
  name: 'request_redraft',
  offline: false,
});

export const keepRedraftCommand = defineClientCommand<KeepRedraftPayload>({
  name: 'keep_redraft',
  offline: true,
  summarize: () => msg({ id: 'planDraft.queued.keep', message: 'Keeping a redrafted day' }),
});

export const revertRedraftCommand = defineClientCommand<RevertRedraftPayload>({
  name: 'revert_redraft',
  offline: true,
  summarize: () => msg({ id: 'planDraft.queued.revert', message: 'Putting a day back' }),
});

export const restoreDraftVersionCommand = defineClientCommand<RestoreDraftVersionPayload>({
  name: 'restore_draft_version',
  offline: true,
  summarize: () => msg({ id: 'planDraft.queued.restore', message: 'Restoring an earlier draft' }),
});
