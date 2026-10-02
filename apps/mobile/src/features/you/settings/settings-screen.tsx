/**
 * Settings over this account and this phone: the synced settings (guide, alarms, privacy) with
 * unsent changes on top, the Help share consent, crew chat pings, the mailbox row the bookings
 * area offers, this phone's sound effects and haptics, the permissions the app holds, signing out
 * and deleting the account (once the server has answered for it), and the build it runs.
 */
import { useLingui } from '@lingui/react/macro';
import * as Application from 'expo-application';
import { router } from 'expo-router';
import { useState } from 'react';

import { BOOKINGS_ROUTES, useMailboxSettingsRow } from '@/features/bookings';
import { useFlag } from '@/lib/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { useFeedbackPrefs } from '@/motion/feedback/prefs';
import { PermissionsSection } from '@/ui/permission-primer/PermissionsSection';

import { usePingPrefs } from '../ping-settings/use-ping-prefs';
import { deviceAccountServices, type AccountServices } from '../account/account-services';
import { useAccountRead } from '../account/use-account';
import { nativeNameOf } from '../language/language-names';
import { YOU_ROUTES } from '../routes';
import { CrewChatSheet } from './crew-chat-sheet';
import { useHelpShareConsent } from './help-share-consent';
import { useLocationRow } from './location-row';
import { useSettingsSections } from './settings-sections';
import { SettingsView } from './settings-view';
import { playTokekTheme } from './tokek-theme';
import { useSyncedSettings } from './use-synced-settings';

const STICKER_SOUNDS = 'stickers-and-stamps';

/** "CRITTERPASS 1.0 (214)"; the brand is set in capitals here, as on the pass cover. */
export function versionLine(version: string | null, build: string | null): string {
  const name = 'CRITTERPASS';
  if (version === null) return name;
  return build === null ? `${name} ${version}` : `${name} ${version} (${build})`;
}

export function SettingsScreen({
  services = deviceAccountServices,
}: {
  readonly services?: AccountServices;
}) {
  const { t } = useLingui();
  const prefs = useFeedbackPrefs();
  const locale = useLocale();
  const account = useAccountRead(services);
  const synced = useSyncedSettings();
  const helpShare = useHelpShareConsent();
  const pings = usePingPrefs();
  const mailbox = useMailboxSettingsRow();
  const location = useLocationRow();
  // Reading the inbox needs a provider switched on for this build; until then the row offers the
  // crew's forward address, which works today.
  /* eslint-disable lingui/no-unlocalized-strings -- feature flag keys, never copy. */
  const gmail = useFlag('mailbox.gmail');
  const microsoft = useFlag('mailbox.microsoft');
  /* eslint-enable lingui/no-unlocalized-strings */
  const inboxOn = gmail === true || microsoft === true;
  const forwardLine = t({
    id: 'you.settings.mailboxForward',
    message: 'Forward confirmations to your crew’s address',
  });
  const [choosingCrewChat, setChoosingCrewChat] = useState(false);
  const sections = useSettingsSections(
    {
      ...synced.settings,
      crewChat: pings.prefs.crewChat,
      location: location.value,
      mailbox: { title: mailbox.title, subtitle: inboxOn ? mailbox.subtitle : forwardLine },
      helpShare: helpShare.on,
      soundEffects: prefs.categoryEnabled[STICKER_SOUNDS],
      haptics: prefs.hapticsEnabled,
      account: account?.kind === 'ok',
      language: nativeNameOf(locale),
    },
    {
      onSynced: synced.change,
      onCrewChat: () => setChoosingCrewChat(true),
      onPings: () => router.push(YOU_ROUTES.pings),
      onLocation: location.open,
      onMailbox: inboxOn ? mailbox.onPress : () => router.push(BOOKINGS_ROUTES.add),
      onHelpShare: helpShare.set,
      onOfflineTrips: () => router.push(YOU_ROUTES.offlineStorage),
      onSoundEffects: (next) => prefs.setCategoryEnabled(STICKER_SOUNDS, next),
      onHaptics: prefs.setHapticsEnabled,
      onLanguage: () => router.push(YOU_ROUTES.language),
      onSignOut: () => router.push(YOU_ROUTES.signOut),
      onDeleteAccount: () => router.push(YOU_ROUTES.deleteAccount),
    },
  );
  return (
    <>
      <SettingsView
        sections={sections}
        version={versionLine(Application.nativeApplicationVersion, Application.nativeBuildVersion)}
        onTokek={playTokekTheme}
      >
        <PermissionsSection testID="you-settings-permissions" />
      </SettingsView>
      {choosingCrewChat ? (
        <CrewChatSheet
          selected={pings.prefs.crewChat}
          onSelect={(crewChat) => pings.change({ crewChat })}
          onClose={() => setChoosingCrewChat(false)}
        />
      ) : null}
    </>
  );
}
