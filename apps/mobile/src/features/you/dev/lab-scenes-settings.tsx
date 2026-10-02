/** The Settings lab scene (3n-2, 3n-6): the real sections over fixed values, every handler a no-op. */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, never shipped copy. */
import { useSettingsSections } from '../settings/settings-sections';
import { SettingsView } from '../settings/settings-view';

const noop = () => undefined;

export function Settings() {
  const sections = useSettingsSections(
    { soundEffects: true, haptics: true, account: true, language: 'English' },
    {
      onOfflineTrips: noop,
      onPings: noop,
      onSoundEffects: noop,
      onHaptics: noop,
      onLanguage: noop,
      onSignOut: noop,
      onDeleteAccount: noop,
    },
  );
  return <SettingsView sections={sections} version="CRITTERPASS 1.0 (214)" onBack={noop} />;
}
