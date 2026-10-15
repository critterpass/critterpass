/**
 * Under SOS on Help (Android): one line per limit that would keep a crewmate's SOS quiet on this
 * phone (notifications off, Do Not Disturb access, full-screen alerts), each with "Allow" opening
 * the system page that lifts it. Read again when the app returns from settings; nothing once all
 * is allowed, and nothing on iOS.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useAndroidSurfacePermissions } from '@/features/you';
import { Banner, usePremiumTheme } from '@/ui/premium';

import { sosAccessRows, type SosAccessRow } from '../sos/alert-access';

export function SosAlertAccess() {
  const th = usePremiumTheme();
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
    <View style={{ gap: th.space.gap8 }} testID="help-sos-access">
      {rows.map((row) => (
        <Banner
          key={row}
          tone="info"
          text={lines[row]}
          action={{ label: allow, onPress: () => void openSettings(row) }}
          testID={`help-sos-access-${row}`}
        />
      ))}
    </View>
  );
}
