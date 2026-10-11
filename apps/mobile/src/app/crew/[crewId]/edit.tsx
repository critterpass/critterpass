import { EditCrewScreen } from '@/features/crew/premium/edit-crew-screen';
import { CrewSettingsRedirect } from '@/features/crew/premium/settings-redirect';
import { premiumRoute } from '@/lib/premium-ui';

/** Edit crew (3.13); the current UI edits the name on its settings page. */
export default premiumRoute({ premium: EditCrewScreen, legacy: CrewSettingsRedirect });
