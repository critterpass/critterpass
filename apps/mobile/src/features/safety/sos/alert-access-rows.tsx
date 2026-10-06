/**
 * Under SOS on the Help screen (Android): one line per limit that would keep a crewmate's SOS
 * quiet on this phone, each with the system page that lifts it. Read again whenever the app
 * returns from settings; renders nothing once everything is allowed, and nothing on iOS.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useAndroidSurfacePermissions } from '@/features/you';
import { DeniedRow } from '@/ui/permission-primer/DeniedRow';

import { sosAccessRows, type SosAccessRow } from './alert-access';

export function SosAlertAccessRows() {
  const { t } = useLingui();
  const { state, openSettings } = useAndroidSurfacePermissions();
  const rows = sosAccessRows(state);
  if (rows.length === 0) return null;

  const lines: Readonly<Record<SosAccessRow, string>> = {
    notifications: t({
      id: 'safety.sosAccess.notifications',
      message: 'Notifications are off, so a crewmate’s SOS cannot reach you.',
    }),
    dnd_access: t({
      id: 'safety.sosAccess.dnd',
      message: 'In Do Not Disturb a crewmate’s SOS stays silent. Let it ring through.',
    }),
    full_screen_intent: t({
      id: 'safety.sosAccess.fullScreen',
      message: 'On a locked phone an SOS shows as a small banner. Let it take the full screen.',
    }),
  };
  const allow = t({ id: 'safety.sosAccess.allow', message: 'Allow' });

  return (
    <View testID="help-sos-access">
      {rows.map((row) => (
        <DeniedRow
          key={row}
          line={lines[row]}
          actionLabel={allow}
          onOpenSettings={() => {
            openSettings(row);
          }}
          testID={`help-sos-access-${row}`}
        />
      ))}
    </View>
  );
}
