import { ChecklistScreen } from '@/features/safety/help/checklist-screen';
import { ChecklistPremium } from '@/features/safety/premium/ChecklistPremium';
import { premiumRoute } from '@/lib/premium-ui';

/** One Help problem's checklist: hurt, lost or stolen, lost, missed a ride. */
export default premiumRoute({ premium: ChecklistPremium, legacy: ChecklistScreen });
