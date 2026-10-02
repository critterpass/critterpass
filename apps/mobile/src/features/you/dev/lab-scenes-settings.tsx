/** The Settings lab scene (3n-2, 3n-6): the real sections over the render's values, every handler a no-op. */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, never shipped copy. */
import { useSettingsSections } from '../settings/settings-sections';
import { SettingsView } from '../settings/settings-view';

const noop = () => undefined;

export function Settings() {
  const sections = useSettingsSections(
    {
      chattiness: 'normal',
      talkOutLoud: true,
      crewChat: 'mentions',
      location: 'trips',
      mailbox: {
        title: 'Find bookings in my email',
        subtitle: 'Read-only, confirmations only',
      },
      helpShare: false,
      hideCollection: false,
      soundEffects: true,
      haptics: true,
      account: true,
      language: 'English',
    },
    {
      onSynced: noop,
      onCrewChat: noop,
      onPings: noop,
      onLocation: noop,
      onMailbox: noop,
      onHelpShare: noop,
      onOfflineTrips: noop,
      onSoundEffects: noop,
      onHaptics: noop,
      onLanguage: noop,
      onSignOut: noop,
      onDeleteAccount: noop,
    },
  );
  return (
    <SettingsView
      sections={sections}
      version="CRITTERPASS 1.0 (214)"
      onTokek={noop}
      onBack={noop}
    />
  );
}
