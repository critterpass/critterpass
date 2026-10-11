import { BillingIssueScreen } from '@/features/monetize/plan/billing-issue-screen';
import { BillingIssuePremium } from '@/features/monetize/premium/billing-issue-premium';
import { premiumRoute } from '@/lib/premium-ui';

/** The payment didn't go through (4d-3; premium 9.24). */
export default premiumRoute({ premium: BillingIssuePremium, legacy: BillingIssueScreen });
