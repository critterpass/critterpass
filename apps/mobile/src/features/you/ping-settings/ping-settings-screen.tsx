/**
 * "How much we ping" (5b-4) over the person's synced settings: moving the budget ticks, reads a
 * sample of a day at that level and saves; the rows save as they change; the pickers open as
 * sheets. Changes are queued when offline and shown at once.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import { goBackOr } from '@/lib/navigation/back';
import { usePermission } from '@/lib/permissions';
import { impact } from '@/motion';

import { AndroidPermissionRows } from '../android-permissions';
import { YOU_ROUTES } from '../routes';
import { ChoiceSheet, type Choice } from './choice-sheet';
import { clampBudget, type CrewChatMode } from './ping-prefs';
import { usePingSample } from './ping-sample';
import { PingSettingsView } from './ping-settings-view';
import { usePingPrefs } from './use-ping-prefs';

const ROUNDUP_TIMES = ['17:00', '18:00', '19:00', '20:00', '21:00', '22:00'] as const;
const QUIET_WINDOWS = ['21:00–06:00', '22:00–07:00', '23:00–07:00', '00:00–08:00'] as const;
const QUIET_OFF = 'off';

type Picker = 'roundup' | 'crew-chat' | 'quiet' | null;

export function PingSettingsScreen() {
  const { t, i18n } = useLingui();
  const { prefs, change } = usePingPrefs();
  const notifications = usePermission('notifications');
  const speakSample = usePingSample(i18n.locale);
  const [picker, setPicker] = useState<Picker>(null);
  const status = notifications.report?.status;

  const onBudget = (next: number) => {
    const budget = clampBudget(next);
    if (budget === prefs.budget) return;
    impact('tick');
    speakSample(budget);
    change({ budget });
  };

  const roundupChoices: Choice<string>[] = [...new Set([...ROUNDUP_TIMES, prefs.roundupTime])]
    .sort()
    .map((time) => ({ key: time, title: time }));
  const chatChoices: Choice<CrewChatMode>[] = [
    {
      key: 'all',
      title: t({ id: 'you.pings.crewChat.all', message: 'Every message' }),
      description: t({
        id: 'you.pings.crewChat.allLine',
        message: 'One banner per crew, however busy it gets',
      }),
    },
    {
      key: 'mentions',
      title: t({ id: 'you.pings.crewChat.mentions', message: 'Mentions only' }),
      description: t({
        id: 'you.pings.crewChat.mentionsLine',
        message: 'Only when someone names you',
      }),
    },
    {
      key: 'off',
      title: t({ id: 'you.pings.crewChat.off', message: 'Off' }),
      description: t({ id: 'you.pings.crewChat.offLine', message: 'Chat waits in the app' }),
    },
  ];
  const currentQuiet =
    prefs.quietFrom === prefs.quietTo ? QUIET_OFF : `${prefs.quietFrom}–${prefs.quietTo}`;
  const quietChoices: Choice<string>[] = [
    ...[...new Set([...QUIET_WINDOWS, ...(currentQuiet === QUIET_OFF ? [] : [currentQuiet])])]
      .sort()
      .map((window) => ({ key: window, title: window })),
    {
      key: QUIET_OFF,
      title: t({ id: 'you.pings.quietOff', message: 'Off' }),
      description: t({ id: 'you.pings.quietOffLine', message: 'Pings arrive at any hour' }),
    },
  ];
  const onQuiet = (key: string) => {
    if (key === QUIET_OFF) return change({ quietFrom: '00:00', quietTo: '00:00' });
    const [quietFrom, quietTo] = key.split('–');
    if (quietFrom !== undefined && quietTo !== undefined) change({ quietFrom, quietTo });
  };
  const close = () => setPicker(null);

  return (
    <>
      <PingSettingsView
        prefs={prefs}
        notificationsOff={status === 'denied' || status === 'restricted'}
        onBudget={onBudget}
        onRoundupTime={() => setPicker('roundup')}
        onGuideTips={(guideTips) => change({ guideTips })}
        onCrewChat={() => setPicker('crew-chat')}
        onMoney={(money) => change({ money })}
        onCrittersNearby={(crittersNearby) => change({ crittersNearby })}
        onQuietHours={() => setPicker('quiet')}
        onOpenSettings={() => void notifications.openSettings()}
        systemLimits={<AndroidPermissionRows omit={['notifications']} />}
        onBack={() => goBackOr(YOU_ROUTES.settings)}
      />
      {picker === 'roundup' ? (
        <ChoiceSheet
          title={t({ id: 'you.pings.roundupSheet', message: 'Roundup time' })}
          choices={roundupChoices}
          selected={prefs.roundupTime}
          onSelect={(roundupTime) => change({ roundupTime })}
          onClose={close}
          testID="you-pings-roundup-sheet"
        />
      ) : null}
      {picker === 'crew-chat' ? (
        <ChoiceSheet
          title={t({ id: 'you.pings.crewChat', message: 'Crew chat' })}
          choices={chatChoices}
          selected={prefs.crewChat}
          onSelect={(crewChat) => change({ crewChat })}
          onClose={close}
          testID="you-pings-chat-sheet"
        />
      ) : null}
      {picker === 'quiet' ? (
        <ChoiceSheet
          title={t({ id: 'you.pings.quiet', message: 'Quiet hours' })}
          choices={quietChoices}
          selected={currentQuiet}
          onSelect={onQuiet}
          onClose={close}
          testID="you-pings-quiet-sheet"
        />
      ) : null}
    </>
  );
}
