import { SignOutScreen } from '@/features/you/account/sign-out-screen';
import { SignOutPremiumView } from '@/features/you/premium/account/sign-out-premium-view';

export default function SignOutRoute() {
  return <SignOutScreen View={SignOutPremiumView} />;
}
