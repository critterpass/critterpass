import { MemberSheet } from '@/features/crew/premium/member-sheet';
import { CrewSettingsRedirect } from '@/features/crew/premium/settings-redirect';
import { premiumRoute } from '@/lib/premium-ui';

/** A member (3.14); the current UI lists members on its settings page. */
export default premiumRoute({ premium: MemberSheet, legacy: CrewSettingsRedirect });
