import { CrewSettingsPremium } from '@/features/crew/premium/crew-settings-screen';
import { CrewSettingsScreen } from '@/features/crew/settings/CrewSettingsScreen';
import { premiumRoute } from '@/lib/premium-ui';

/** Crew settings (3.12). */
export default premiumRoute({ premium: CrewSettingsPremium, legacy: CrewSettingsScreen });
