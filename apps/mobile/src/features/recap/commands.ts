/**
 * Client specs for the recap's commands. Opening and finishing the recap, the signature, the MVP
 * vote and the got-away reminder may wait in the offline queue (the server replays them by id);
 * asking for a failed build again is online only, so the page never says it failed while a retry
 * waits unsent. Reacting to a year-later memory and pitching a reunion also wait offline. Making
 * and switching off the recap's public link are online only: a link exists, or is off, at once.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type {
  CastMvpVotePayload,
  CreateRecapLinkPayload,
  ReactMemoryPayload,
  RecordRecapViewPayload,
  RetryRecapPayload,
  RevokeRecapLinkPayload,
  SaveSignaturePayload,
  SetLegendaryReminderPayload,
  StartReunionPayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const retryRecapCommand = defineClientCommand<RetryRecapPayload>({
  name: 'retry_recap',
  offline: false,
  summarize: () => msg({ id: 'recap.queued.retry', message: 'Building the recap again' }),
});

export const recordRecapViewCommand = defineClientCommand<RecordRecapViewPayload>({
  name: 'record_recap_view',
  offline: true,
  summarize: ({ kind }) =>
    kind === 'open'
      ? msg({ id: 'recap.queued.open', message: 'Signing the crew stamp' })
      : msg({ id: 'recap.queued.complete', message: 'Watched the recap' }),
});

export const saveSignatureCommand = defineClientCommand<SaveSignaturePayload>({
  name: 'save_signature',
  offline: true,
  summarize: () => msg({ id: 'recap.queued.signature', message: 'Your signature' }),
});

export const castMvpVoteCommand = defineClientCommand<CastMvpVotePayload>({
  name: 'cast_mvp_vote',
  offline: true,
  summarize: () => msg({ id: 'recap.queued.mvp', message: 'Your MVP vote' }),
});

export const setLegendaryReminderCommand = defineClientCommand<SetLegendaryReminderPayload>({
  name: 'set_legendary_reminder',
  offline: true,
  summarize: () =>
    msg({ id: 'recap.queued.remind', message: 'A reminder for the one that got away' }),
});

export const reactMemoryCommand = defineClientCommand<ReactMemoryPayload>({
  name: 'react_memory',
  offline: true,
  summarize: () => msg({ id: 'recap.queued.react', message: 'Your reaction to the memory' }),
});

export const startReunionCommand = defineClientCommand<StartReunionPayload>({
  name: 'start_reunion',
  offline: true,
  summarize: () => msg({ id: 'recap.queued.reunion', message: 'Pitching a reunion to the crew' }),
});

export const createRecapLinkCommand = defineClientCommand<CreateRecapLinkPayload>({
  name: 'create_recap_link',
  offline: false,
  summarize: () => msg({ id: 'recap.queued.link', message: 'A link to the recap' }),
});

export const revokeRecapLinkCommand = defineClientCommand<RevokeRecapLinkPayload>({
  name: 'revoke_recap_link',
  offline: false,
  summarize: () => msg({ id: 'recap.queued.linkOff', message: 'Switching the recap link off' }),
});
