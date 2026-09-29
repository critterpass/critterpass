/**
 * The guide's private ask (N-05, category `cp.setup_ask`) and its two quick replies, "Freed it" and
 * "Can't move it": the category is registered with titles from the reader's catalogs (again when
 * the language changes), and a tapped reply becomes `answer_availability_ask` through the command
 * client, so it queues offline like any other answer. Both actions open the app
 * (`opensAppToForeground`): background JS is not reliably started for a killed app on either
 * platform, so the app opens on the ask sheet, which confirms the answer in place. A reply that
 * cold-started the app is picked up from the last response once the session is up.
 */
/* eslint-disable lingui/no-unlocalized-strings -- category and action ids, payload keys. */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import { askAnswerSchema, type AskAnswer } from '@cp/domain';

import { useCommand } from '@/data/commands/use-command';

import { answerAvailabilityAskCommand } from './data/commands';
import { setupRoutes } from './routes';

export const SETUP_ASK_CATEGORY = 'cp.setup_ask';

/** What a quick reply on an ask push carries. */
export interface AskReply {
  readonly key: string;
  readonly answer: AskAnswer;
  readonly askId: string;
  readonly tripId: string | null;
}

export type CategoryWriter = (
  id: string,
  actions: Notifications.NotificationAction[],
) => Promise<unknown>;

export function askActions(titles: {
  readonly freed: string;
  readonly notMovable: string;
}): Notifications.NotificationAction[] {
  return [
    { identifier: 'freed', buttonTitle: titles.freed, options: { opensAppToForeground: true } },
    {
      identifier: 'not_movable',
      buttonTitle: titles.notMovable,
      options: { opensAppToForeground: true },
    },
  ];
}

/** Registers (or re-titles) the ask category. */
export function registerSetupNotificationCategory(
  titles: { readonly freed: string; readonly notMovable: string },
  write: CategoryWriter = Notifications.setNotificationCategoryAsync,
): Promise<unknown> {
  return write(SETUP_ASK_CATEGORY, askActions(titles));
}

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      return record(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** The `cp` block of a push: in the APNs payload (iOS), the FCM data (Android) or local data. */
function cpBlock(request: Notifications.NotificationRequest): Record<string, unknown> | null {
  const trigger = request.trigger as {
    payload?: unknown;
    remoteMessage?: { data?: unknown };
  } | null;
  return (
    record(record(trigger?.payload)?.['cp']) ??
    record(record(trigger?.remoteMessage?.data)?.['cp']) ??
    record(record(request.content.data)?.['cp'])
  );
}

/** The quick reply a response carries, or null when it is anything else. */
export function askReplyOf(response: Notifications.NotificationResponse): AskReply | null {
  const answer = askAnswerSchema.safeParse(response.actionIdentifier);
  if (!answer.success) return null;
  const request = response.notification.request;
  if (request.content.categoryIdentifier !== SETUP_ASK_CATEGORY) return null;
  const cp = cpBlock(request);
  const askId = record(cp?.['ctx'])?.['ask_id'];
  if (typeof askId !== 'string') return null;
  const tripId = cp?.['trip_id'];
  return {
    key: `${request.identifier}:${response.actionIdentifier}`,
    answer: answer.data,
    askId,
    tripId: typeof tripId === 'string' ? tripId : null,
  };
}

const handled = new Set<string>();

export interface AskReplyDeps {
  readonly send: (payload: { ask_id: string; answer: AskAnswer }) => Promise<unknown>;
  readonly open: (reply: AskReply) => void;
}

/** Sends one reply once (the live listener and the cold-start read may both see it). */
export async function handleAskReply(reply: AskReply | null, deps: AskReplyDeps): Promise<void> {
  if (reply === null || handled.has(reply.key)) return;
  handled.add(reply.key);
  await deps.send({ ask_id: reply.askId, answer: reply.answer });
  deps.open(reply);
}

/** Test-only: forget which replies were handled. */
export function resetAskRepliesForTests(): void {
  handled.clear();
}

/** Mounted once inside the signed-in session: category titles and the reply handler. */
export function SetupNotificationActions() {
  const { t, i18n } = useLingui();
  const { send } = useCommand(answerAvailabilityAskCommand);

  useEffect(() => {
    registerSetupNotificationCategory({
      freed: t({ id: 'setup.push.freed', message: 'Freed it' }),
      notMovable: t({ id: 'setup.push.notMovable', message: 'Can’t move it' }),
    }).catch(() => undefined);
  }, [t, i18n.locale]);

  useEffect(() => {
    const deps: AskReplyDeps = {
      send,
      open: (reply) => {
        if (reply.tripId === null) return;
        router.push(setupRoutes.ask(reply.tripId, reply.askId, reply.answer));
      },
    };
    const onResponse = (response: Notifications.NotificationResponse | null) => {
      if (response === null) return;
      const reply = askReplyOf(response);
      if (reply === null) return;
      void handleAskReply(reply, deps).then(() =>
        Notifications.clearLastNotificationResponseAsync().catch(() => undefined),
      );
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(onResponse);
    Notifications.getLastNotificationResponseAsync().then(onResponse, () => undefined);
    return () => subscription.remove();
  }, [send]);

  return null;
}
