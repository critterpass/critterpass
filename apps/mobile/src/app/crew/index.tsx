import { CrewsSheet } from '@/features/crew/crews-sheet/CrewsSheet';
import { PremiumCrewsRoute } from '@/features/home/premium/crew-switcher/crews-route';
import { premiumRoute } from '@/lib/premium-ui';

/** Your crews (3g-3): the current UI's sheet, or Home's crew switcher in the premium UI (3.07). */
export default premiumRoute({ premium: PremiumCrewsRoute, legacy: CrewsSheet });
