import { StartCrewSheet } from '@/features/crew/premium/start-crew-sheet';
import { StartCrewScreen } from '@/features/crew/start-crew/StartCrewScreen';
import { premiumRoute } from '@/lib/premium-ui';

/** Start a crew (3.08): the premium sheet with the live pass, or the current page. */
export default premiumRoute({ premium: StartCrewSheet, legacy: StartCrewScreen });
