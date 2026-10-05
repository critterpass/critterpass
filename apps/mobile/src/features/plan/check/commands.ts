/**
 * The plan check's commands as the app sends them. A FIX and an ask need the server's answer (the
 * toast says what happened, the card leaves), so they go online; an answer to an ask waits in the
 * offline queue like a vote.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const applyCheckFixOnline = defineClientCommand<{ issue_id: string; base_version: string }>({
  name: 'apply_check_fix',
  offline: false,
});

/** The same one-tap fix on an organiser's own draft, before the crew has a plan. */
export const applyDraftCheckFixOnline = defineClientCommand<{
  issue_id: string;
  base_version: string;
}>({ name: 'apply_draft_check_fix', offline: false });

/** An organiser's "Keep it as it is": it waits in the offline queue like any plan edit. */
export const keepCheckIssueCommand = defineClientCommand<{
  issue_id: string;
  base_version: string;
}>({
  name: 'keep_check_issue',
  offline: true,
  summarize: () => msg({ id: 'plan.check.queued.keep', message: 'Keeping a stop as it is' }),
});

export const askMemberOnline = defineClientCommand<{
  ask_id: string;
  trip_id: string;
  user_id: string;
  idea_ids: string[];
}>({ name: 'ask_member_about_saves', offline: false });

export const answerMemberAskCommand = defineClientCommand<{ ask_id: string; accept: boolean }>({
  name: 'answer_member_ask',
  offline: true,
  summarize: (payload) =>
    payload.accept
      ? msg({ id: 'plan.check.queued.askYes', message: 'Your yes to adding your saves' })
      : msg({ id: 'plan.check.queued.askNo', message: 'Your no to adding your saves' }),
});

/** Unticking every swap of the forecast watch's weather move turns that suggestion down. */
export const dismissWeatherOnline = defineClientCommand<{ changeset_id: string }>({
  name: 'dismiss_weather_suggestion',
  offline: true,
  summarize: () =>
    msg({ id: 'plan.check.queued.dismissWeather', message: 'Keeping the day as it is' }),
});
