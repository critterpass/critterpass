import { LeaveCrewScreen } from '@/features/crew/premium/leave-crew-screen';
import { CrewSettingsRedirect } from '@/features/crew/premium/settings-redirect';
import { premiumRoute } from '@/lib/premium-ui';

/** Leave the crew, handing it over (3.16); the current UI leaves from its settings page. */
export default premiumRoute({ premium: LeaveCrewScreen, legacy: CrewSettingsRedirect });
