/**
 * The Settings sections and their rows, in the order the screen shows them. Values and handlers
 * come from the caller: the screen passes this phone's preferences, a lab scene passes fixed ones.
 */
import { useLingui } from '@lingui/react/macro';

import { PINGS_ROW_LINE, PINGS_ROW_TITLE } from '../ping-settings/copy';
import type { SettingsSection } from './settings-view';

export interface SettingsValues {
  readonly soundEffects: boolean;
  readonly haptics: boolean;
  /** The app's language, in its own script ("Tiếng Việt"). */
  readonly language: string;
  /** The server answered for this account: only then are the account rows offered. */
  readonly account: boolean;
}

export interface SettingsHandlers {
  readonly onOfflineTrips: () => void;
  readonly onPings: () => void;
  readonly onSoundEffects: (next: boolean) => void;
  readonly onHaptics: (next: boolean) => void;
  readonly onLanguage: () => void;
  readonly onSignOut: () => void;
  readonly onDeleteAccount: () => void;
}

export function useSettingsSections(
  values: SettingsValues,
  handlers: SettingsHandlers,
): readonly SettingsSection[] {
  const { t } = useLingui();
  return [
    {
      id: 'offline',
      title: t({ id: 'you.settings.offline', message: 'Offline' }),
      rows: [
        {
          key: 'offline-trips',
          kind: 'value',
          title: t({ id: 'you.settings.offlineTrips', message: 'Trips saved offline' }),
          subtitle: t({
            id: 'you.settings.offlineTripsLine',
            message: 'Bookings, maps and phrases on this phone',
          }),
          value: '',
          onPress: handlers.onOfflineTrips,
        },
      ],
    },
    {
      id: 'app',
      title: t({ id: 'you.settings.app', message: 'App' }),
      rows: [
        {
          key: 'pings',
          kind: 'value',
          title: t(PINGS_ROW_TITLE),
          subtitle: t(PINGS_ROW_LINE),
          value: '',
          onPress: handlers.onPings,
        },
        {
          key: 'sound-effects',
          kind: 'toggle',
          title: t({ id: 'you.settings.soundEffects', message: 'Sound effects' }),
          subtitle: t({
            id: 'you.settings.soundEffectsLine',
            message: 'Sticker slaps, stamps, pops',
          }),
          value: values.soundEffects,
          onChange: handlers.onSoundEffects,
        },
        {
          key: 'haptics',
          kind: 'toggle',
          title: t({ id: 'you.settings.haptics', message: 'Haptics' }),
          subtitle: t({ id: 'you.settings.hapticsLine', message: 'Taps and thuds you can feel' }),
          value: values.haptics,
          onChange: handlers.onHaptics,
        },
        {
          key: 'language',
          kind: 'value',
          title: t({ id: 'you.settings.language', message: 'Language' }),
          value: values.language,
          onPress: handlers.onLanguage,
        },
      ],
    },
    {
      id: 'account',
      title: t({ id: 'you.settings.account', message: 'Account' }),
      rows: values.account
        ? [
            {
              key: 'sign-out',
              kind: 'value',
              title: t({ id: 'you.settings.signOut', message: 'Sign out' }),
              value: '',
              onPress: handlers.onSignOut,
            },
            {
              key: 'delete-account',
              kind: 'destructive',
              title: t({ id: 'you.settings.deleteAccount', message: 'Delete account' }),
              onPress: handlers.onDeleteAccount,
            },
          ]
        : [],
    },
  ];
}
