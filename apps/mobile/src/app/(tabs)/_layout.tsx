import '@/features/home/register';
import { usePremiumUi } from '@/lib/premium-ui';
import { PremiumTabs } from '@/ui/premium/shell/navigation/premium-tabs';
import { RootErrorBoundary } from '@/ui/shell/RootErrorBoundary';
import { ShellTabs } from '@/ui/shell/ShellTabs';

// A screen that fails inside the tabs is contained here: the pages pushed over them stay.
export { RootErrorBoundary as ErrorBoundary };

/**
 * The app's tabs. The tab screens (`index`, `trips`, `wallet`, `pass`) belong to their areas; the
 * shell owns the bar, the `tab` transition and the session gate (signed-out and mid-onboarding
 * sessions go to onboarding once that route is registered). The premium UI uses the system tab bar
 * with the guide circle (`guide-circle`); the current UI its own bar with the guide button.
 */
export default function TabsLayout() {
  return usePremiumUi() ? <PremiumTabs /> : <ShellTabs />;
}
