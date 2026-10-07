/**
 * The Android explainer rows (5b-4 settings banners): one line per limit the person can lift in
 * system settings, each with the one fix. Built from the shared denied row; renders nothing on iOS
 * or once everything is granted.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { DeniedRow } from '@/ui/permission-primer/DeniedRow';

import { explainerRows, type SettingsBanner } from './explainer-rows';
import { useAndroidSurfacePermissions } from './use-android-surface-permissions';

export interface AndroidPermissionRowsProps {
  /** Rows the screen already shows its own way. */
  readonly omit?: readonly SettingsBanner[];
}

export function AndroidPermissionRows({ omit }: AndroidPermissionRowsProps) {
  const { t } = useLingui();
  const { state, openSettings } = useAndroidSurfacePermissions();
  const rows = explainerRows(state, omit);
  if (rows.length === 0) return null;

  const lines: Record<SettingsBanner, string> = {
    notifications: t({
      id: 'you.androidPermissions.notifications',
      message: 'Notifications are off, so alarms, SOS and votes cannot reach you.',
    }),
    exact_alarm: t({
      id: 'you.androidPermissions.exactAlarm',
      message: 'Leave-by alarms may ring a few minutes late. Allow alarms to ring on time.',
    }),
    full_screen_intent: t({
      id: 'you.androidPermissions.fullScreen',
      message: 'Alarms show as a banner. Allow full screen to wake you over the lock screen.',
    }),
    dnd_access: t({
      id: 'you.androidPermissions.dnd',
      message: 'A crewmate’s SOS stays silent in Do Not Disturb. Allow it to ring through.',
    }),
    promoted: t({
      id: 'you.androidPermissions.promoted',
      message: 'Live updates are off, so trip countdowns sit in the shade, not the status bar.',
    }),
  };

  return (
    <View testID="you-android-permissions">
      {rows.map((banner) => (
        <DeniedRow
          key={banner}
          line={lines[banner]}
          onOpenSettings={() => {
            openSettings(banner);
          }}
          testID={`you-android-permissions-${banner}`}
        />
      ))}
    </View>
  );
}
