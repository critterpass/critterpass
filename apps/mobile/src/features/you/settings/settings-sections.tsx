/**
 * The Settings sections and their rows, in the registry's order. Values and handlers come from the
 * caller: the screen passes this account's settings, a lab scene passes fixed ones. A row whose
 * value or screen is not there (no mailbox row, no account yet) is left out, never drawn dead.
 */
import type { Chattiness } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { View, type ViewStyle } from 'react-native';

import type { SettingsRow } from '@/ui/inputs/SettingsGroup';
import { Segmented } from '@/ui/inputs/Segmented';

import { PINGS_ROW_LINE, PINGS_ROW_TITLE } from '../ping-settings/copy';
import type { CrewChatMode } from '../ping-settings/ping-prefs';
import type { LocationValue } from './location-row';
import { SETTINGS_REGISTRY, SETTINGS_SECTIONS, type SettingsSectionId } from './registry';
import type { SyncedSettings } from './synced-settings';
import type { SettingsSection } from './settings-view';

const CHATTY_TRACK: ViewStyle = { flexShrink: 1, maxWidth: '64%' };

export interface SettingsValues extends SyncedSettings {
  readonly crewChat: CrewChatMode;
  /** What location the app holds, from this phone's permission. */
  readonly location: LocationValue;
  /** The mailbox row's line, when the bookings area offers one. */
  readonly mailbox: { readonly title: string; readonly subtitle: string } | null;
  readonly helpShare: boolean;
  readonly soundEffects: boolean;
  readonly haptics: boolean;
  /** The app's language, in its own script ("Tiếng Việt"). */
  readonly language: string;
  /** The server answered for this account: only then are the account rows offered. */
  readonly account: boolean;
}

export interface SettingsHandlers {
  readonly onSynced: (change: Partial<SyncedSettings>) => void;
  readonly onCrewChat: () => void;
  readonly onPings: () => void;
  readonly onLocation: () => void;
  readonly onMailbox: () => void;
  readonly onHelpShare: (next: boolean) => void;
  readonly onOfflineTrips: () => void;
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
  const chattiness: readonly { value: Chattiness; label: string }[] = [
    { value: 'quiet', label: t({ id: 'you.settings.chatty.quiet', message: 'Quiet' }) },
    { value: 'normal', label: t({ id: 'you.settings.chatty.normal', message: 'Normal' }) },
    { value: 'chatty', label: t({ id: 'you.settings.chatty.chatty', message: 'Chatty' }) },
  ];
  const crewChat: Readonly<Record<CrewChatMode, string>> = {
    all: t({ id: 'you.pings.crewChat.all', message: 'Every message' }),
    mentions: t({ id: 'you.pings.crewChat.mentions', message: 'Mentions only' }),
    off: t({ id: 'you.pings.crewChat.off', message: 'Off' }),
  };
  const locationWords: Readonly<Record<LocationValue, string>> = {
    trips: t({ id: 'you.settings.location.trips', message: 'During trips' }),
    always: t({ id: 'you.settings.location.always', message: 'Always' }),
    off: t({ id: 'you.settings.location.off', message: 'Off' }),
    ask: t({ id: 'you.settings.location.ask', message: 'Ask' }),
  };
  const toggle = (
    key: string,
    title: string,
    subtitle: string | undefined,
    value: boolean,
    onChange: (next: boolean) => void,
  ): SettingsRow => ({
    key,
    kind: 'toggle',
    title,
    ...(subtitle === undefined ? {} : { subtitle }),
    value,
    onChange,
  });

  const rows: Readonly<Record<string, SettingsRow | null>> = {
    chattiness: {
      key: 'chattiness',
      kind: 'custom',
      title: t({ id: 'you.settings.howChatty', message: 'How chatty' }),
      // Bounded, so the title keeps its words whole beside the three options.
      trailing: (
        <View style={CHATTY_TRACK}>
          <Segmented
            segments={chattiness}
            value={values.chattiness}
            onChange={(next) => handlers.onSynced({ chattiness: next })}
            label={t({ id: 'you.settings.howChatty', message: 'How chatty' })}
            testID="you-settings-chattiness"
          />
        </View>
      ),
    },
    'talk-out-loud': toggle(
      'talk-out-loud',
      t({ id: 'you.settings.talkOutLoud', message: 'Talk out loud' }),
      t({ id: 'you.settings.talkOutLoudLine', message: 'Voice replies when you speak first' }),
      values.talkOutLoud,
      (next) => handlers.onSynced({ talkOutLoud: next }),
    ),
    'leave-by-alarms': toggle(
      'leave-by-alarms',
      t({ id: 'you.settings.leaveByAlarms', message: 'Leave-by alarms' }),
      t({ id: 'you.settings.leaveByAlarmsLine', message: 'Can ring through Do Not Disturb' }),
      values.leaveByThroughDnd,
      (next) => handlers.onSynced({ leaveByThroughDnd: next }),
    ),
    'crew-chat': {
      key: 'crew-chat',
      kind: 'value',
      title: t({ id: 'you.pings.crewChat', message: 'Crew chat' }),
      value: crewChat[values.crewChat],
      onPress: handlers.onCrewChat,
    },
    pings: {
      key: 'pings',
      kind: 'value',
      title: t(PINGS_ROW_TITLE),
      subtitle: t(PINGS_ROW_LINE),
      value: '',
      onPress: handlers.onPings,
    },
    location: {
      key: 'location',
      kind: 'value',
      title: t({ id: 'you.settings.location', message: 'Location' }),
      value: locationWords[values.location],
      onPress: handlers.onLocation,
    },
    mailbox:
      values.mailbox === null
        ? null
        : {
            key: 'mailbox',
            kind: 'value',
            title: values.mailbox.title,
            subtitle: values.mailbox.subtitle,
            value: '',
            onPress: handlers.onMailbox,
          },
    'budget-max': {
      key: 'budget-max',
      kind: 'private',
      title: t({ id: 'you.settings.budgetMax', message: 'Budget max' }),
      subtitle: t({
        id: 'you.settings.budgetMaxLine',
        message: 'Never shown to anyone, guides included',
      }),
    },
    'help-share': toggle(
      'help-share',
      t({ id: 'you.settings.helpShare', message: 'Share where I am from Help' }),
      t({
        id: 'you.settings.helpShareLine',
        message: 'For an hour with the crew, when I open Help',
      }),
      values.helpShare,
      handlers.onHelpShare,
    ),
    'hide-collection': toggle(
      'hide-collection',
      t({ id: 'you.settings.hideCollection', message: 'Hide my critters' }),
      t({ id: 'you.settings.hideCollectionLine', message: 'Crews stop seeing your collection' }),
      values.hideCollection,
      (next) => handlers.onSynced({ hideCollection: next }),
    ),
    'hide-travel-style': toggle(
      'hide-travel-style',
      t({ id: 'you.settings.hideTravelStyle', message: 'Hide my travel style' }),
      t({ id: 'you.settings.hideTravelStyleLine', message: 'Crews stop seeing your taste tags' }),
      values.hideTasteTags,
      (next) => handlers.onSynced({ hideTasteTags: next }),
    ),
    'hide-lockscreen': toggle(
      'hide-lockscreen',
      t({ id: 'you.settings.hideLockscreen', message: 'Hide details on the lock screen' }),
      t({
        id: 'you.settings.hideLockscreenLine',
        message: 'Pings and live trips show no amounts or places',
      }),
      values.hideLockscreenDetails,
      (next) => handlers.onSynced({ hideLockscreenDetails: next }),
    ),
    'offline-trips': {
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
    'sound-effects': toggle(
      'sound-effects',
      t({ id: 'you.settings.soundEffects', message: 'Sound effects' }),
      t({ id: 'you.settings.soundEffectsLine', message: 'Sticker slaps, stamps, pops' }),
      values.soundEffects,
      handlers.onSoundEffects,
    ),
    haptics: toggle(
      'haptics',
      t({ id: 'you.settings.haptics', message: 'Haptics' }),
      t({ id: 'you.settings.hapticsLine', message: 'Taps and thuds you can feel' }),
      values.haptics,
      handlers.onHaptics,
    ),
    language: {
      key: 'language',
      kind: 'value',
      title: t({ id: 'you.settings.language', message: 'Language' }),
      value: values.language,
      onPress: handlers.onLanguage,
    },
    'sign-out': values.account
      ? {
          key: 'sign-out',
          kind: 'value',
          title: t({ id: 'you.settings.signOut', message: 'Sign out' }),
          value: '',
          onPress: handlers.onSignOut,
        }
      : null,
    'delete-account': values.account
      ? {
          key: 'delete-account',
          kind: 'destructive',
          title: t({ id: 'you.settings.deleteAccount', message: 'Delete account' }),
          onPress: handlers.onDeleteAccount,
        }
      : null,
  };

  const titles: Readonly<Record<SettingsSectionId, string>> = {
    guide: t({ id: 'you.settings.guide', message: 'Your guide' }),
    notifications: t({ id: 'you.settings.notifications', message: 'Notifications' }),
    privacy: t({ id: 'you.settings.privacy', message: 'Privacy' }),
    offline: t({ id: 'you.settings.offline', message: 'Offline' }),
    app: t({ id: 'you.settings.app', message: 'App' }),
    account: t({ id: 'you.settings.account', message: 'Account' }),
  };

  return SETTINGS_SECTIONS.map((id) => ({
    id,
    title: titles[id],
    rows: SETTINGS_REGISTRY.filter((def) => def.section === id).flatMap((def) => {
      const row = rows[def.key];
      return row === null || row === undefined ? [] : [row];
    }),
  }));
}
