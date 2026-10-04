/**
 * Approve / Reject on a change set's push (category `cp.changeset`): the category is registered
 * with titles from the reader's catalogs (again when the language changes), and a tapped action
 * becomes `approve_changeset` through the command client, so it queues offline like a vote in the
 * app. Both actions open the app on the review screen, where the tally confirms the answer; a
 * reply that cold-started the app is picked up from the last response once the session is up.
 */
/* eslint-disable lingui/no-unlocalized-strings -- category and action ids, payload keys. */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { planRoutes } from '../overview/routes';
import { approveChangesetCommand } from '@/data/plan/commands';

export const CHANGESET_CATEGORY = 'cp.changeset';
const ACTIONS = { approve: 'yes', reject: 'no' } as const;

export interface ChangesetReply {
  readonly key: string;
  readonly decision: 'yes' | 'no';
  readonly changesetId: string;
  readonly tripId: string | null;
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

/** The decision a response carries, or null when it is anything else. */
export function changesetReplyOf(
  response: Notifications.NotificationResponse,
): ChangesetReply | null {
  const id = response.actionIdentifier;
  if (id !== 'approve' && id !== 'reject') return null;
  const request = response.notification.request;
  if (request.content.categoryIdentifier !== CHANGESET_CATEGORY) return null;
  const cp = cpBlock(request);
  const ctx = record(cp?.['ctx']);
  const changesetId = ctx?.['change_set_id'];
  if (typeof changesetId !== 'string') return null;
  const tripId = ctx?.['trip_id'] ?? cp?.['trip_id'];
  return {
    key: `${request.identifier}:${id}`,
    decision: ACTIONS[id],
    changesetId,
    tripId: typeof tripId === 'string' ? tripId : null,
  };
}

const handled = new Set<string>();

/** Test-only: forget which replies were handled. */
export function resetChangesetRepliesForTests(): void {
  handled.clear();
}

/** Sends one reply once (the live listener and the cold-start read may both see it). */
export async function handleChangesetReply(
  reply: ChangesetReply | null,
  deps: {
    readonly send: (payload: { changeset_id: string; decision: 'yes' | 'no' }) => Promise<unknown>;
    readonly open: (reply: ChangesetReply) => void;
  },
): Promise<void> {
  if (reply === null || handled.has(reply.key)) return;
  handled.add(reply.key);
  await deps.send({ changeset_id: reply.changesetId, decision: reply.decision });
  deps.open(reply);
}

/** Mounted once inside the signed-in session: category titles and the reply handler. */
export function ChangesetNotificationActions() {
  const { t, i18n } = useLingui();
  const { send } = useCommand(approveChangesetCommand);

  useEffect(() => {
    Notifications.setNotificationCategoryAsync(CHANGESET_CATEGORY, [
      {
        identifier: 'approve',
        buttonTitle: t({ id: 'plan.push.approve', message: 'Approve' }),
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'reject',
        buttonTitle: t({ id: 'plan.push.reject', message: 'Not this' }),
        options: { opensAppToForeground: true },
      },
    ]).catch(() => undefined);
  }, [t, i18n.locale]);

  useEffect(() => {
    const deps = {
      send,
      open: (reply: ChangesetReply) => {
        if (reply.tripId !== null) router.push(planRoutes.review(reply.tripId, reply.changesetId));
      },
    };
    const onResponse = (response: Notifications.NotificationResponse | null) => {
      if (response === null) return;
      const reply = changesetReplyOf(response);
      if (reply === null) return;
      void handleChangesetReply(reply, deps).then(() =>
        Notifications.clearLastNotificationResponseAsync().catch(() => undefined),
      );
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(onResponse);
    Notifications.getLastNotificationResponseAsync().then(onResponse, () => undefined);
    return () => subscription.remove();
  }, [send]);

  return null;
}
