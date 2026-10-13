import { SentScreen } from '@/features/help/feedback/sent-screen';
import { FeedbackSentPremiumScreen } from '@/features/help/premium/feedback-sent-premium-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** Feedback sent (3p-3). */
function LegacyFeedbackSentRoute() {
  return <SentScreen />;
}

export default premiumRoute({
  premium: FeedbackSentPremiumScreen,
  legacy: LegacyFeedbackSentRoute,
});
