/**
 * Connect a calendar (undesigned; from the sheet, list-card and settings patterns): this phone's
 * calendar (connect, synced n ago with "Sync now", or access off with Settings and the by-hand
 * fallback), Google and Outlook when their flags are on, the "maybe busy" opt-in for tentative
 * events, and "Mark days by hand". Every line says what leaves the phone: free and busy days only.
 */
import { calendarOAuthFlag, type OAuthCalendarProvider } from '@cp/domain';
import { useState, type ComponentType } from 'react';

import { useFlag } from '@/lib/analytics/flags';

import { useSetupServices } from '../data/services';
import { installDeviceId, startCalendarOAuth } from './oauth';
import { useCalendarSync, type CalendarSyncStatus } from './use-calendar-sync';
import { useMyDays, type MyDay } from './use-my-days';

export interface CalendarConnectViewProps {
  readonly status: CalendarSyncStatus;
  readonly lastSyncedAt: Date | null;
  readonly now: Date;
  readonly tentative: boolean;
  /** Providers whose connect row is switched on. */
  readonly providers: readonly OAuthCalendarProvider[];
  /** The provider whose browser sign-in is opening. */
  readonly opening: OAuthCalendarProvider | null;
  readonly oauthFailed: boolean;
  readonly onConnect: () => void;
  readonly onSync: () => void;
  readonly onOpenSettings: () => void;
  readonly onTentative: (next: boolean) => void;
  readonly onProvider: (provider: OAuthCalendarProvider) => void;
  readonly onMarkByHand: () => void;
  readonly onDismiss: () => void;
  /** This person's own days for the coming week as the crew reads them; null when not read. */
  readonly week?: readonly MyDay[] | null;
}

export interface CalendarConnectSheetProps {
  readonly tripId: string;
  readonly onDismiss: () => void;
  readonly onMarkByHand: () => void;
  /** How the sheet is drawn. */
  readonly View: ComponentType<CalendarConnectViewProps>;
}

export function CalendarConnectSheet({
  tripId,
  onDismiss,
  onMarkByHand,
  View: Look,
}: CalendarConnectSheetProps) {
  const services = useSetupServices();
  const sync = useCalendarSync(tripId, { now: services.now });
  const google = useFlag(calendarOAuthFlag('google'));
  const microsoft = useFlag(calendarOAuthFlag('microsoft'));
  const week = useMyDays(tripId, sync.lastSyncedAt);
  const [opening, setOpening] = useState<OAuthCalendarProvider | null>(null);
  const [oauthFailed, setOauthFailed] = useState(false);
  const providers: OAuthCalendarProvider[] = [
    ...(google ? (['google'] as const) : []),
    ...(microsoft ? (['microsoft'] as const) : []),
  ];

  const onProvider = (provider: OAuthCalendarProvider) => {
    setOpening(provider);
    setOauthFailed(false);
    void installDeviceId()
      .then((deviceId) => startCalendarOAuth(services, provider, deviceId, sync.tentative))
      .then(
        (started) => setOauthFailed(started.kind === 'failed'),
        () => setOauthFailed(true),
      )
      .finally(() => setOpening(null));
  };

  return (
    <Look
      status={sync.status}
      lastSyncedAt={sync.lastSyncedAt}
      now={new Date(services.now())}
      tentative={sync.tentative}
      providers={providers}
      opening={opening}
      oauthFailed={oauthFailed}
      onConnect={() => void sync.connect()}
      onSync={() => void sync.sync()}
      onOpenSettings={() => void sync.openSettings()}
      onTentative={sync.setTentative}
      onProvider={onProvider}
      onMarkByHand={onMarkByHand}
      onDismiss={onDismiss}
      week={week}
    />
  );
}
