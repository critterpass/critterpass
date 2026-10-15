import '@/features/home/register';
import { PremiumTabs } from '@/ui/premium/shell/navigation/premium-tabs';
import { PremiumRootErrorBoundary } from '@/features/home/premium/recovery/premium-error-boundary';

// A screen that fails inside the tabs is contained here: the pages pushed over them stay.
export { PremiumRootErrorBoundary as ErrorBoundary };

/**
 * The app's tabs. The tab screens (`index`, `trips`, `wallet`, `pass`) belong to their areas; the
 * shell owns the bar and the session gate (signed-out and mid-onboarding sessions go to onboarding
 * once that route is registered): the system tab bar with the guide circle (`guide-circle`).
 */
export default function TabsLayout() {
  return <PremiumTabs />;
}
