/**
 * Settings over this account and this phone: the synced settings (guide, alarms, privacy) with
 * unsent changes on top, the Help share consent, crew chat pings, the mailbox row the bookings
 * area offers, this phone's music and sound effects, the permissions the app holds, signing out
 * and deleting the account (once the server has answered for it), and the build it runs.
 */
import { useLingui } from '@lingui/react/macro';
import * as Application from 'expo-application';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform } from 'react-native';

import { BOOKINGS_ROUTES, useMailboxSettingsRow } from '@/features/bookings';
import { feedbackHref, HELP_ROUTES, storeReviewUrl, useIdeasToVote } from '@/features/help';
import { useMoneyDisplay } from '@/data/money';
import { useFlag } from '@/lib/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { mapsAppFor, useChosenMapsApp } from '@/features/go';
import { useFeedbackPrefs } from '@/motion/feedback/prefs';
import { PermissionsSection } from '@/ui/permission-primer/PermissionsSection';

import { usePingPrefs } from '../ping-settings/use-ping-prefs';
import { deviceAccountServices, type AccountServices } from '../account/account-services';
import { useAccountRead } from '../account/use-account';
import { exportLine } from '../export/export-copy';
import { useDataExport } from '../export/use-data-export';
import { languageLine } from '../language/currency-model';
import { nativeNameOf } from '../language/language-names';
import { hasAlternateAppIcons } from '../app-icon/device';
import { YOU_ROUTES } from '../routes';
import { CrewChatSheet } from './crew-chat-sheet';
import { useHelpShareConsent } from './help-share-consent';
import { useLocationRow } from './location-row';
import { useMusicLine } from '../sound/music-line';
import { useSettingsSections } from './settings-sections';
import { SettingsView } from './settings-view';
import { playTokekTheme } from './tokek-theme';
import { useSyncedSettings } from './use-synced-settings';

const STICKER_SOUNDS = 'stickers-and-stamps';
/** Location has its own row under PRIVACY (3n-2), so the permissions section leaves it out. */
const IN_PRIVACY = ['location'] as const;

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
  const money = useMoneyDisplay();
  const ideasToVote = useIdeasToVote();
  const reviewUrl = storeReviewUrl(Platform.OS, Application.applicationId);
  const dataExport = useDataExport();
  const [chosenMapsApp, setMapsApp] = useChosenMapsApp();
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
  const musicLine = useMusicLine(prefs.musicEnabled);
  const sections = useSettingsSections(
    {
      ...synced.settings,
      crewChat: pings.prefs.crewChat,
      location: location.value,
      mailbox: { title: mailbox.title, subtitle: inboxOn ? mailbox.subtitle : forwardLine },
      helpShare: helpShare.on,
      soundEffects: prefs.categoryEnabled[STICKER_SOUNDS],
      music: musicLine,
      mapsApp: Platform.OS === 'ios' ? mapsAppFor('ios', chosenMapsApp) : null,
      account: account?.kind === 'ok',
      language: languageLine(nativeNameOf(locale), money),
      appIcon: hasAlternateAppIcons(),
      ideasToVote,
      storeName:
        Platform.OS === 'ios'
          ? t({ id: 'you.settings.rateIos', message: 'On the App Store' })
          : t({ id: 'you.settings.rateAndroid', message: 'On Google Play' }),
      dataExport: {
        line: exportLine(dataExport.state, dataExport.problem, locale),
        enabled:
          !dataExport.busy &&
          dataExport.state.kind !== 'building' &&
          !(dataExport.state.kind === 'expired' && dataExport.state.askAgainAt !== null),
      },
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
      onMusic: () => router.push(YOU_ROUTES.sound),
      onMapsApp: setMapsApp,
      onLanguage: () => router.push(YOU_ROUTES.language),
      onAppIcon: () => router.push(YOU_ROUTES.appIcon),
      onSignOut: () => router.push(YOU_ROUTES.signOut),
      onRate: reviewUrl === null ? null : () => void Linking.openURL(reviewUrl),
      onFeedback: () => router.push(feedbackHref({ mode: 'feedback', context: 'settings' })),
      onIdea: () => router.push(feedbackHref({ mode: 'idea', context: 'settings' })),
      onHelpCentre: () =>
        router.push({ pathname: HELP_ROUTES.hub, params: { context: 'settings' } }),
      onDataExport: () =>
        dataExport.state.kind === 'ready' ? dataExport.open() : dataExport.request(),
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
        <PermissionsSection exclude={IN_PRIVACY} testID="you-settings-permissions" />
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
