import { SignOutScreen } from '@/features/you/account/sign-out-screen';
import { SignOutPremiumView } from '@/features/you/premium/account/sign-out-premium-view';
import { premiumRoute } from '@/lib/premium-ui';

function PremiumSignOutRoute() {
  return <SignOutScreen View={SignOutPremiumView} />;
}

function SignOutRoute() {
  return <SignOutScreen />;
}

export default premiumRoute({ premium: PremiumSignOutRoute, legacy: SignOutRoute });
