/**
 * The actions on an SOS push (category `cp.sos`): COMING tells the sender this person is on the way
 * (`respond_sos{coming}` through the command client, so it queues offline) and opens the SOS; CALL
 * dials the sender when their number is visible to the crew, else opens the SOS; OPEN opens it. The
 * category's titles come from the reader's catalogs (again when the language changes). A reply that
 * cold-started the app is picked up from the last response once the session is up, and each reply
 * is handled once.
 */
/* eslint-disable lingui/no-unlocalized-strings -- category and action ids, payload keys, SQL. */
import { useLingui } from '@lingui/react/macro';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Linking } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { useLocalFirst } from '@/data/powersync/local-first-context';

import { respondSosCommand } from './commands';
import { telUrl } from './format';
import { safetyRoutes } from './routes';

export const SOS_CATEGORY = 'cp.sos';
export const SOS_ACTIONS = ['COMING', 'CALL', 'OPEN'] as const;
export type SosAction = (typeof SOS_ACTIONS)[number];

export interface SosReply {
  readonly key: string;
  readonly action: SosAction;
  readonly sosId: string;
  readonly tripId: string | null;
  readonly senderId: string | null;
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

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** The SOS action a response carries, or null when it is anything else. */
export function sosReplyOf(response: Notifications.NotificationResponse): SosReply | null {
  const action = SOS_ACTIONS.find((id) => id === response.actionIdentifier);
  if (action === undefined) return null;
  const request = response.notification.request;
  if (request.content.categoryIdentifier !== SOS_CATEGORY) return null;
  const ctx = record(cpBlock(request)?.['ctx']);
  const sosId = text(ctx?.['sos_id']);
  if (sosId === null) return null;
  return {
    key: `${request.identifier}:${action}`,
    action,
    sosId,
    tripId: text(ctx?.['trip_id']),
    senderId: text(ctx?.['sender_id']),
  };
}

export interface SosReplyDeps {
  readonly respond: (payload: { sos_id: string; state: 'coming' }) => Promise<unknown>;
  /** The sender's number as the crew sees it, or null when they do not show one. */
  readonly phoneOf: (reply: SosReply) => Promise<string | null>;
  readonly dial: (phone: string) => void;
  readonly open: (sosId: string) => void;
}

const handled = new Set<string>();

/** Test-only: forget which replies were handled. */
export function resetSosRepliesForTests(): void {
  handled.clear();
}

/** Acts on one reply once (the live listener and the cold-start read may both see it). */
export async function handleSosReply(reply: SosReply | null, deps: SosReplyDeps): Promise<void> {
  if (reply === null || handled.has(reply.key)) return;
  handled.add(reply.key);
  if (reply.action === 'COMING') {
    await deps.respond({ sos_id: reply.sosId, state: 'coming' });
    deps.open(reply.sosId);
    return;
  }
  if (reply.action === 'CALL') {
    const phone = await deps.phoneOf(reply).catch(() => null);
    if (phone !== null) {
      deps.dial(phone);
      return;
    }
  }
  deps.open(reply.sosId);
}

const PHONE_SQL = `
  SELECT cc.phone_display FROM crew_contact_cards cc JOIN trips t ON t.crew_id = cc.crew_id
   WHERE t.id = ? AND cc.user_id = ? AND cc.phone_display IS NOT NULL LIMIT 1`;

/** Mounted once inside the signed-in session: the category's titles and the reply handler. */
export function useSosNotificationActions(): void {
  const { t, i18n } = useLingui();
  const { db } = useLocalFirst();
  const { send } = useCommand(respondSosCommand);

  useEffect(() => {
    Notifications.setNotificationCategoryAsync(SOS_CATEGORY, [
      {
        identifier: 'COMING',
        buttonTitle: t({ id: 'safety.push.coming', message: "I'm going" }),
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'CALL',
        buttonTitle: t({ id: 'safety.push.call', message: 'Call' }),
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'OPEN',
        buttonTitle: t({ id: 'safety.push.open', message: 'Open' }),
        options: { opensAppToForeground: true },
      },
    ]).catch(() => undefined);
  }, [t, i18n.locale]);

  useEffect(() => {
    const deps: SosReplyDeps = {
      respond: send,
      phoneOf: async (reply) => {
        if (reply.tripId === null || reply.senderId === null) return null;
        const row = await db.getOptional<{ phone_display: string }>(PHONE_SQL, [
          reply.tripId,
          reply.senderId,
        ]);
        return row?.phone_display ?? null;
      },
      dial: (phone) => void Linking.openURL(telUrl(phone)),
      open: (sosId) => router.push(safetyRoutes.sos(sosId)),
    };
    const onResponse = (response: Notifications.NotificationResponse | null) => {
      if (response === null) return;
      const reply = sosReplyOf(response);
      if (reply === null) return;
      void handleSosReply(reply, deps).then(() =>
        Notifications.clearLastNotificationResponseAsync().catch(() => undefined),
      );
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(onResponse);
    Notifications.getLastNotificationResponseAsync().then(onResponse, () => undefined);
    return () => subscription.remove();
  }, [db, send]);
}
