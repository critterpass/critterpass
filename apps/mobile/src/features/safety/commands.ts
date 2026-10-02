/**
 * Client specs for Help and SOS. Everything may wait in the offline queue: a Help share or an SOS
 * raised with no signal replays when it returns, deduplicated by its op id, and the server's stale
 * guard decides whether a late SOS still alerts anyone.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type {
  ExtendHelpSharePayload,
  RequestOpsClinicCallPayload,
  ResolveSosPayload,
  RespondSosPayload,
  SendSosMessagePayload,
  StartHelpSharePayload,
  StopHelpSharePayload,
  TriggerSosPayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const startHelpShareCommand = defineClientCommand<StartHelpSharePayload>({
  name: 'start_help_share',
  offline: true,
  summarize: () => msg({ id: 'safety.queued.startShare', message: 'Sharing where you are' }),
});

export const stopHelpShareCommand = defineClientCommand<StopHelpSharePayload>({
  name: 'stop_help_share',
  offline: true,
  summarize: () => msg({ id: 'safety.queued.stopShare', message: 'Stopping your Help share' }),
});

export const extendHelpShareCommand = defineClientCommand<ExtendHelpSharePayload>({
  name: 'extend_help_share',
  offline: true,
  summarize: () => msg({ id: 'safety.queued.extendShare', message: 'Sharing for another hour' }),
});

export const triggerSosCommand = defineClientCommand<TriggerSosPayload>({
  name: 'trigger_sos',
  offline: true,
  summarize: () => msg({ id: 'safety.queued.sos', message: 'SOS to your crew' }),
});

export const respondSosCommand = defineClientCommand<RespondSosPayload>({
  name: 'respond_sos',
  offline: true,
  summarize: () => msg({ id: 'safety.queued.respond', message: 'Answering an SOS' }),
});

export const sendSosMessageCommand = defineClientCommand<SendSosMessagePayload>({
  name: 'send_sos_message',
  offline: true,
  summarize: () => msg({ id: 'safety.queued.message', message: 'Message to the crew' }),
});

export const resolveSosCommand = defineClientCommand<ResolveSosPayload>({
  name: 'resolve_sos',
  offline: true,
  summarize: () => msg({ id: 'safety.queued.resolve', message: 'Telling the crew you are OK' }),
});

export const requestOpsClinicCallCommand = defineClientCommand<RequestOpsClinicCallPayload>({
  name: 'request_ops_clinic_call',
  offline: true,
  summarize: () =>
    msg({ id: 'safety.queued.clinic', message: 'Asking the ops desk to call the clinic' }),
});

/** The Help share consent (`consents.purpose = help_auto_share`), off until the person turns it on. */
export const HELP_SHARE_CONSENT = 'help_auto_share';
export const HELP_SHARE_CONSENT_COPY_VERSION = 'help-share-1';
/** Where the Help hub's GO opens the ride quote (3h-3 Getting around). */
export const GETTING_AROUND_SCREEN = '3h-3';
