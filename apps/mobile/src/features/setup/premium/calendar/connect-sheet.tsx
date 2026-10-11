/**
 * Find your free days (4.11), a tall sheet over the dates step: "We read free and busy. Nothing
 * else." with the calendar doodle, the promise that titles stay on the phone, the calendars card
 * (this phone's calendar synced, not connected, reading, off in Settings or failed with Try again;
 * Google and Outlook when their flags are on), sharing tentative events as "maybe", and "Mark days
 * by hand" at the foot. The shared `CalendarConnectSheet` holds the sync and the sign-ins.
 */
import type { OAuthCalendarProvider } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Doodle } from '@/features/explore';
import { OverlaySheet } from '@/features/plan';
import { useLocale } from '@/lib/i18n/use-locale';
import { Button, ListCard, Text, Toggle, usePremiumTheme, type StatusTone } from '@/ui/premium';
import { relativeAge } from '@/ui/states/StaleCaption';

import type { CalendarConnectViewProps } from '../../calendar/calendar-connect-sheet';
import { CrewSees } from './crew-sees';

/* eslint-disable lingui/no-unlocalized-strings -- calendar app marks, the same in every language. */
const GLYPH = { device: '31', google: 'G', microsoft: 'O' } as const;
/* eslint-enable lingui/no-unlocalized-strings */

interface CalendarRow {
  readonly key: string;
  readonly glyph: string;
  readonly tone: StatusTone;
  readonly name: string;
  readonly status: string;
  readonly statusTone: 'muted' | 'good' | 'bad';
  readonly action: {
    readonly label: string;
    readonly ink: boolean;
    readonly busy?: boolean;
    readonly onPress: () => void;
    readonly testID: string;
  } | null;
  readonly testID: string;
}

function phoneRow(props: CalendarConnectViewProps, locale: string): CalendarRow {
  const base = {
    key: 'device',
    glyph: GLYPH.device,
    tone: 'voteOpen' as const,
    name: t({ id: 'setup.calendar.device', message: 'This phone’s calendar' }),
  };
  switch (props.status) {
    case 'needs_permission':
      return {
        ...base,
        status: t({ id: 'setup.calendar.notConnected', message: 'Not connected' }),
        statusTone: 'muted',
        action: {
          label: t({ id: 'setup.calendar.connect', message: 'Connect' }),
          ink: true,
          onPress: props.onConnect,
          testID: 'calendar-device-connect',
        },
        testID: 'calendar-device',
      };
    case 'syncing':
      return {
        ...base,
        status: t({ id: 'setup.calendar.syncing', message: 'Reading your free days…' }),
        statusTone: 'muted',
        action: null,
        testID: 'calendar-device-syncing',
      };
    case 'synced': {
      const age =
        props.lastSyncedAt === null ? '' : relativeAge(props.lastSyncedAt, props.now, locale);
      return {
        ...base,
        status: t({ id: 'setup.calendar.synced', message: `Synced ${age}` }),
        statusTone: 'good',
        action: {
          label: t({ id: 'setup.premium.calendar.sync', message: 'Sync' }),
          ink: false,
          onPress: props.onSync,
          testID: 'calendar-device-sync',
        },
        testID: 'calendar-device-synced',
      };
    }
    case 'error':
      return {
        ...base,
        status: t({ id: 'setup.calendar.error', message: 'Couldn’t read your calendar.' }),
        statusTone: 'bad',
        action: {
          label: t({ id: 'setup.premium.calendar.retry', message: 'Retry' }),
          ink: false,
          onPress: props.onSync,
          testID: 'calendar-device-retry',
        },
        testID: 'calendar-device-error',
      };
    case 'denied':
      return {
        ...base,
        status: t({ id: 'setup.calendar.deniedTitle', message: 'Calendar access is off' }),
        statusTone: 'bad',
        action: {
          label: t({ id: 'setup.premium.calendar.settings', message: 'Settings' }),
          ink: false,
          onPress: props.onOpenSettings,
          testID: 'calendar-device-settings',
        },
        testID: 'calendar-device-denied',
      };
    case 'unavailable':
      return {
        ...base,
        status: t({
          id: 'setup.calendar.unavailable',
          message: 'Needs the latest app update. Mark your days by hand for now.',
        }),
        statusTone: 'muted',
        action: null,
        testID: 'calendar-device-unavailable',
      };
  }
}

function providerRow(props: CalendarConnectViewProps, provider: OAuthCalendarProvider) {
  const google = provider === 'google';
  return {
    key: provider,
    glyph: GLYPH[provider],
    tone: google ? ('unopened' as const) : ('rain' as const),
    name: google
      ? t({ id: 'setup.calendar.google', message: 'Google Calendar' })
      : t({ id: 'setup.calendar.microsoft', message: 'Outlook Calendar' }),
    status: t({ id: 'setup.calendar.freeBusyOnly', message: 'Free and busy only' }),
    statusTone: 'muted' as const,
    action: {
      label: t({ id: 'setup.calendar.connect', message: 'Connect' }),
      ink: true,
      busy: props.opening === provider,
      onPress: () => props.onProvider(provider),
      testID: `calendar-oauth-${provider}`,
    },
    testID: `calendar-provider-${provider}`,
  };
}

export function PremiumCalendarConnectView(props: CalendarConnectViewProps) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const rows = [phoneRow(props, locale), ...props.providers.map((p) => providerRow(props, p))];
  const statusColour = {
    muted: theme.color.inkSecondary,
    good: theme.color.status.booked.text,
    bad: theme.color.status.voteOpen.text,
  };
  return (
    <OverlaySheet
      tall
      title={t({ id: 'setup.calendar.title', message: 'Find your free days' })}
      line={t({
        id: 'setup.premium.calendar.line',
        message: 'We read free and busy. Nothing else.',
      })}
      closeLabel={t({ id: 'setup.premium.calendar.close', message: 'Close' })}
      onDismiss={props.onDismiss}
      aside={
        <View style={{ transform: [{ rotate: '8deg' }], marginTop: -8 }}>
          <Doodle name="cal" size={56} />
        </View>
      }
      footer={
        <Button
          variant="secondary"
          label={t({ id: 'setup.premium.calendar.byHand', message: 'Mark days by hand instead' })}
          onPress={props.onMarkByHand}
          testID="calendar-by-hand"
        />
      }
      testID="calendar-connect"
    >
      {props.week == null || props.week.length === 0 ? (
        <Text variant="caption" tone="inkSecondary">
          {t({
            id: 'setup.calendar.promise',
            message:
              'Only free and busy days leave your phone. Titles, places and people stay here.',
          })}
        </Text>
      ) : (
        <CrewSees week={props.week} />
      )}
      <ListCard>
        {rows.map((row) => (
          <View
            key={row.key}
            testID={row.testID}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space.gap12,
              paddingVertical: 11,
              paddingHorizontal: theme.space.rowPadH,
            }}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.color.status[row.tone].bg,
              }}
            >
              <Text variant="rowTitle" color={theme.color.status[row.tone].text}>
                {row.glyph}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="rowTitle">{row.name}</Text>
              <Text variant="captionMuted" color={statusColour[row.statusTone]}>
                {row.status}
              </Text>
            </View>
            {row.action === null ? null : (
              <Button
                size="small"
                variant={row.action.ink ? 'primary' : 'control'}
                label={row.action.label}
                onPress={row.action.onPress}
                loading={row.action.busy === true}
                testID={row.action.testID}
              />
            )}
          </View>
        ))}
      </ListCard>
      {props.status === 'denied' ? (
        <Text variant="caption" tone="muted" testID="calendar-device-denied-line">
          {t({
            id: 'setup.calendar.deniedBody',
            message: 'Turn it on in Settings, or mark the days you can do by hand.',
          })}
        </Text>
      ) : null}
      {props.oauthFailed ? (
        <Text
          variant="caption"
          color={theme.color.status.voteOpen.text}
          testID="calendar-oauth-failed"
        >
          {t({
            id: 'setup.calendar.oauthFailed',
            message: 'That calendar didn’t open. Check your signal and try again.',
          })}
        </Text>
      ) : null}
      <View
        testID="calendar-tentative"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.gap12,
          paddingHorizontal: 6,
          paddingTop: theme.space.gap4,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text variant="rowTitle">
            {t({ id: 'setup.premium.calendar.tentative', message: 'Share tentative as “maybe”' })}
          </Text>
          <Text variant="captionMuted" tone="muted">
            {t({
              id: 'setup.premium.calendar.tentativeHint',
              message: 'The crew sees maybe, never the event.',
            })}
          </Text>
        </View>
        <Toggle
          value={props.tentative}
          onChange={props.onTentative}
          accessibilityLabel={t({
            id: 'setup.premium.calendar.tentative',
            message: 'Share tentative as “maybe”',
          })}
        />
      </View>
    </OverlaySheet>
  );
}
