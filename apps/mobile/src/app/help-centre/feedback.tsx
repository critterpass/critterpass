import { FeedbackScreen } from '@/features/help/feedback/feedback-screen';
import { FeedbackPremiumScreen } from '@/features/help/premium/feedback-premium-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** Send feedback, a problem report or an idea (3p-2). */
function LegacyFeedbackRoute() {
  return <FeedbackScreen />;
}

export default premiumRoute({ premium: FeedbackPremiumScreen, legacy: LegacyFeedbackRoute });
