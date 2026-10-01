/**
 * Settings over what the phone already knows: where offline trips are kept, the sound effects and
 * haptics this device plays, the permissions the app holds, signing out and deleting the account
 * (once the server has answered for it), and the build it runs.
 */
import * as Application from 'expo-application';
import { router } from 'expo-router';

import { useFeedbackPrefs } from '@/motion/feedback/prefs';
import { PermissionsSection } from '@/ui/permission-primer/PermissionsSection';

import { deviceAccountServices, type AccountServices } from '../account/account-services';
import { useAccountRead } from '../account/use-account';
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

export function SettingsScreen({
  services = deviceAccountServices,
}: {
  readonly services?: AccountServices;
}) {
  const prefs = useFeedbackPrefs();
  const account = useAccountRead(services);
  const sections = useSettingsSections(
    {
      soundEffects: prefs.categoryEnabled[STICKER_SOUNDS],
      haptics: prefs.hapticsEnabled,
      account: account?.kind === 'ok',
    },
    {
      onSignOut: () => router.push(YOU_ROUTES.signOut),
      onDeleteAccount: () => router.push(YOU_ROUTES.deleteAccount),
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
