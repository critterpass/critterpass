/**
 * Settings over what the phone already knows: where offline trips are kept, the sound effects and
 * haptics this device plays, the permissions the app holds, and the build it runs.
 */
import * as Application from 'expo-application';
import { router } from 'expo-router';

import { useFeedbackPrefs } from '@/motion/feedback/prefs';
import { PermissionsSection } from '@/ui/permission-primer/PermissionsSection';

import { YOU_ROUTES } from '../routes';
import { useSettingsSections } from './settings-sections';
import { SettingsView } from './settings-view';

const STICKER_SOUNDS = 'stickers-and-stamps';

/** "CRITTERPASS 1.0 (214)"; the brand is set in capitals here, as on the pass cover. */
export function versionLine(version: string | null, build: string | null): string {
  const name = 'CRITTERPASS';
  if (version === null) return name;
  return build === null ? `${name} ${version}` : `${name} ${version} (${build})`;
}

export function SettingsScreen() {
  const prefs = useFeedbackPrefs();
  const sections = useSettingsSections(
    { soundEffects: prefs.categoryEnabled[STICKER_SOUNDS], haptics: prefs.hapticsEnabled },
    {
      onOfflineTrips: () => router.push(YOU_ROUTES.offlineStorage),
      onSoundEffects: (next) => prefs.setCategoryEnabled(STICKER_SOUNDS, next),
      onHaptics: prefs.setHapticsEnabled,
    },
  );
  return (
    <SettingsView
      sections={sections}
      version={versionLine(Application.nativeApplicationVersion, Application.nativeBuildVersion)}
    >
      <PermissionsSection testID="you-settings-permissions" />
    </SettingsView>
  );
}
