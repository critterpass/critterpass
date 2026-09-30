/**
 * The trip day's session-wide runtime, mounted once in the signed-in app: the alarm sync, the
 * I'M UP / SNOOZE actions on the leave-by notification, the native alarm's own taps, and the
 * app's alarm screen when the leave-by rings on a phone without a system alarm for it.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { Modal } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { useOwnerUid } from '../hub/data/live-rows';
import { useLocale } from '@/lib/i18n/use-locale';
import { impact } from '@/motion/feedback';

import { setAlarmPort, type AlarmPort } from './alarm-port';
import { setReadinessCommand, snoozeLeaveByCommand } from '../leave-by/commands';
import type { LeaveByView } from '../leave-by/model';
import { tripDayRoute } from '../hub/routes';
import { LEAVE_BY_CATEGORY, LEAVE_BY_CATEGORY_NO_SNOOZE, leaveByDataOf } from './alarm-backends';
import { alarmText } from './alarm-copy';
import { dueAlarm } from './alarm-plan';
import { alarmStore, useAlarmState } from './alarm-store';
import { InAppAlarm } from './in-app-alarm';
import { useAlarmSync } from './use-alarm-sync';

export const SNOOZE_MS = 5 * 60 * 1000;
const RING_EVERY_MS = 6000;

function useNotificationActions(
  up: (leaveById: string, source: 'notification') => void,
  snooze: (leaveById: string, count: number) => void,
) {
  const { t, i18n } = useLingui();
  useEffect(() => {
    const imUp = {
      identifier: 'up',
      buttonTitle: t({ id: 'trip.alarm.imUp', message: "I'm up" }),
      options: { opensAppToForeground: true },
    };
    const snoozeAction = {
      identifier: 'snooze',
      buttonTitle: t({ id: 'trip.alarm.snooze', message: 'Snooze 5 min' }),
      options: { opensAppToForeground: true },
    };
    Notifications.setNotificationCategoryAsync(LEAVE_BY_CATEGORY, [imUp, snoozeAction]).catch(
      () => undefined,
    );
    Notifications.setNotificationCategoryAsync(LEAVE_BY_CATEGORY_NO_SNOOZE, [imUp]).catch(
      () => undefined,
    );
  }, [t, i18n.locale]);

  useEffect(() => {
    const handled = new Set<string>();
    const onResponse = (response: Notifications.NotificationResponse | null) => {
      if (response === null) return;
      const request = response.notification.request;
      const data = leaveByDataOf(request.content.data);
      if (data === null) return;
      const key = `${request.identifier}:${response.actionIdentifier}`;
      if (handled.has(key)) return;
      handled.add(key);
      if (response.actionIdentifier === 'up') up(data.leave_by_id, 'notification');
      else if (response.actionIdentifier === 'snooze') snooze(data.leave_by_id, data.snooze_count);
      else if (data.trip_id !== '') router.push(tripDayRoute(data.trip_id, null));
      Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(onResponse);
    Notifications.getLastNotificationResponseAsync().then(onResponse, () => undefined);
    return () => subscription.remove();
  }, [up, snooze]);
}

function useNow(everyMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

export function TripDayRuntime({ alarmPort }: { readonly alarmPort: AlarmPort | null }) {
  setAlarmPort(alarmPort);
  const me = useOwnerUid();
  const locale = useLocale();
  const { views, guideFor } = useAlarmSync(me);
  const { status, snoozedUntil, silenced } = useAlarmState();
  const { send: sendReadiness } = useCommand(setReadinessCommand);
  const { send: sendSnooze } = useCommand(snoozeLeaveByCommand);
  const now = useNow(5000);

  const up = useCallback(
    (leaveById: string, source: 'notification' | 'alarm') => {
      alarmStore.silence(leaveById);
      void sendReadiness({ leave_by_id: leaveById, state: 'up', source });
    },
    [sendReadiness],
  );
  const snooze = useCallback(
    (leaveById: string, count: number) => {
      alarmStore.snooze(leaveById, new Date(Date.now() + SNOOZE_MS));
      void sendSnooze({ leave_by_id: leaveById, count: count + 1 });
    },
    [sendSnooze],
  );
  useNotificationActions(up, snooze);

  useEffect(() => {
    if (alarmPort === null) return undefined;
    const subscription = alarmPort.addActionListener((action) => {
      if (action.action === 'up') alarmStore.silence(action.leaveById);
      else alarmStore.snooze(action.leaveById, new Date(new Date(action.at).getTime() + SNOOZE_MS));
    });
    return () => subscription.remove();
  }, [alarmPort]);

  const ringing: LeaveByView | null =
    status.mode === 'native'
      ? null
      : dueAlarm(
          views.filter((view) => !silenced.has(view.id)),
          now,
          snoozedUntil,
        );
  const ringingId = ringing?.id ?? null;
  useEffect(() => {
    if (ringingId === null) return undefined;
    impact('alarm');
    const timer = setInterval(() => impact('alarm'), RING_EVERY_MS);
    return () => clearInterval(timer);
  }, [ringingId]);

  if (ringing === null) return null;
  const guide = guideFor(ringing.tripId);
  const snoozeAllowed = ringing.viewerSnoozes < ringing.policy.snooze_limit;
  const text = alarmText(ringing, guide.name, locale);
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // The hardware back button snoozes (and counts), as on the system alarm.
        if (snoozeAllowed) snooze(ringing.id, ringing.viewerSnoozes);
      }}
    >
      <InAppAlarm
        guide={guide.slug}
        eyebrow={text.eyebrow}
        time={text.time}
        subtitle={text.subtitle}
        guideLine={text.guideLine}
        snoozeAllowed={snoozeAllowed}
        onUp={() => up(ringing.id, 'alarm')}
        onSnooze={() => snooze(ringing.id, ringing.viewerSnoozes)}
        {...(snoozeAllowed ? {} : { onClose: () => alarmStore.silence(ringing.id) })}
      />
    </Modal>
  );
}
