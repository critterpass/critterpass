/**
 * Connect a calendar (undesigned; from the sheet, list-card and settings patterns): this phone's
 * calendar (connect, synced n ago with "Sync now", or access off with Settings and the by-hand
 * fallback), Google and Outlook when their flags are on, the "maybe busy" opt-in for tentative
 * events, and "Mark days by hand". Every line says what leaves the phone: free and busy days only.
 */
import { calendarOAuthFlag, type OAuthCalendarProvider } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { useFlag } from '@/lib/analytics/flags';
import { useLocale } from '@/lib/i18n/use-locale';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { ListCard } from '@/ui/cards/ListCard';
import { SettingsGroup } from '@/ui/inputs/SettingsGroup';
import { Sheet } from '@/ui/sheet/Sheet';
import { PermissionCard } from '@/ui/states/PermissionCard';
import { relativeAge } from '@/ui/states/StaleCaption';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { useSetupServices } from '../data/services';
import { installDeviceId, startCalendarOAuth } from './oauth';
import { useCalendarSync, type CalendarSyncStatus } from './use-calendar-sync';

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
}

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'], gap: th.space['12'] },
  link: { alignSelf: 'center' },
}));

function providerName(provider: OAuthCalendarProvider): string {
  return provider === 'google'
    ? t({ id: 'setup.calendar.google', message: 'Google Calendar' })
    : t({ id: 'setup.calendar.microsoft', message: 'Outlook Calendar' });
}

function DeviceRow(props: CalendarConnectViewProps) {
  const locale = useLocale();
  const title = t({ id: 'setup.calendar.device', message: 'This phone’s calendar' });
  switch (props.status) {
    case 'denied':
      return (
        <PermissionCard
          icon="cal"
          title={t({ id: 'setup.calendar.deniedTitle', message: 'Calendar access is off' })}
          body={t({
            id: 'setup.calendar.deniedBody',
            message: 'Turn it on in Settings, or mark the days you can do by hand.',
          })}
          onOpenSettings={props.onOpenSettings}
          fallback={{
            label: t({ id: 'setup.calendar.byHandShort', message: 'Mark by hand' }),
            onPress: props.onMarkByHand,
          }}
          testID="calendar-device-denied"
        />
      );
    case 'unavailable':
      return (
        <ListCard
          title={title}
          subtitle={t({
            id: 'setup.calendar.unavailable',
            message: 'Needs the latest app update. Mark your days by hand for now.',
          })}
          testID="calendar-device-unavailable"
        />
      );
    case 'needs_permission':
      return (
        <ListCard
          title={title}
          subtitle={t({ id: 'setup.calendar.notConnected', message: 'Not connected' })}
          trailing={
            <PillButton
              size="sm"
              label={t({ id: 'setup.calendar.connect', message: 'Connect' })}
              onPress={props.onConnect}
              testID="calendar-device-connect"
            />
          }
          testID="calendar-device"
        />
      );
    case 'syncing':
      return (
        <ListCard
          title={title}
          subtitle={t({ id: 'setup.calendar.syncing', message: 'Reading your free days…' })}
          testID="calendar-device-syncing"
        />
      );
    case 'error':
      return (
        <ListCard
          title={title}
          subtitle={t({ id: 'setup.calendar.error', message: 'Couldn’t read your calendar.' })}
          trailing={
            <InlineAction
              label={t({ id: 'setup.calendar.retry', message: 'Try again' })}
              onPress={props.onSync}
              testID="calendar-device-retry"
            />
          }
          testID="calendar-device-error"
        />
      );
    case 'synced': {
      const age =
        props.lastSyncedAt === null ? '' : relativeAge(props.lastSyncedAt, props.now, locale);
      return (
        <ListCard
          title={title}
          subtitle={t({ id: 'setup.calendar.synced', message: `Synced ${age}` })}
          trailing={
            <InlineAction
              label={t({ id: 'setup.calendar.syncNow', message: 'Sync now' })}
              onPress={props.onSync}
              testID="calendar-device-sync"
            />
          }
          testID="calendar-device-synced"
        />
      );
    }
  }
}

/** The sheet's content over fixed facts (scenes and tests render it directly). */
export function CalendarConnectView(props: CalendarConnectViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const heading = t({ id: 'setup.calendar.title', message: 'Find your free days' });
  return (
    <Sheet
      detents={['fit']}
      onDismiss={props.onDismiss}
      accessibilityLabel={heading}
      testID="calendar-connect"
    >
      <View style={styles.body}>
        <Text variant="h3" accessibilityRole="header">
          {heading}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'setup.calendar.promise',
            message:
              'Only free and busy days leave your phone. Titles, places and people stay here.',
          })}
        </Text>
        <DeviceRow {...props} />
        {props.providers.map((provider) => (
          <ListCard
            key={provider}
            title={providerName(provider)}
            subtitle={t({ id: 'setup.calendar.freeBusyOnly', message: 'Free and busy only' })}
            trailing={
              <PillButton
                size="sm"
                variant="secondary"
                label={t({ id: 'setup.calendar.connect', message: 'Connect' })}
                loading={props.opening === provider}
                onPress={() => props.onProvider(provider)}
                testID={`calendar-oauth-${provider}`}
              />
            }
            testID={`calendar-provider-${provider}`}
          />
        ))}
        {props.oauthFailed ? (
          <Text variant="bodySm" color={theme.semantic.state.urgent} testID="calendar-oauth-failed">
            {t({
              id: 'setup.calendar.oauthFailed',
              message: 'That calendar didn’t open. Check your signal and try again.',
            })}
          </Text>
        ) : null}
        <SettingsGroup
          rows={[
            {
              key: 'tentative',
              kind: 'toggle',
              title: t({
                id: 'setup.calendar.tentative',
                message: 'Share tentative events as “maybe busy”',
              }),
              subtitle: t({
                id: 'setup.calendar.tentativeHint',
                message: 'Your crew sees “maybe busy”, never the event.',
              }),
              value: props.tentative,
              onChange: props.onTentative,
            },
          ]}
          testID="calendar-tentative"
        />
        <View style={styles.link}>
          <TextLink
            label={t({ id: 'setup.calendar.byHand', message: 'Mark days by hand' })}
            onPress={props.onMarkByHand}
            testID="calendar-by-hand"
          />
        </View>
      </View>
    </Sheet>
  );
}

export interface CalendarConnectSheetProps {
  readonly tripId: string;
  readonly onDismiss: () => void;
  readonly onMarkByHand: () => void;
}

export function CalendarConnectSheet({
  tripId,
  onDismiss,
  onMarkByHand,
}: CalendarConnectSheetProps) {
  const services = useSetupServices();
  const sync = useCalendarSync(tripId, { now: services.now });
  const google = useFlag(calendarOAuthFlag('google'));
  const microsoft = useFlag(calendarOAuthFlag('microsoft'));
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
    <CalendarConnectView
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
    />
  );
}
