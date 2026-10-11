import { SettingsPremiumScreen } from '@/features/you/premium/settings/settings-premium-screen';
import { SettingsScreen } from '@/features/you/settings/settings-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** Settings over this phone's synced settings (3n-2, 3n-6; premium 9.04). */
function LegacySettingsRoute() {
  return <SettingsScreen />;
}

export default premiumRoute({ premium: SettingsPremiumScreen, legacy: LegacySettingsRoute });
