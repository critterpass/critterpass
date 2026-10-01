import '@/features/home/register';
import { ShellTabs } from '@/ui/shell/ShellTabs';

/**
 * The app's tabs. The tab screens (`index`, `trips`, `wallet`, `pass`) belong to their areas; the
 * shell owns the bar, the `tab` transition and the session gate (signed-out and mid-onboarding
 * sessions go to onboarding once that route is registered).
 */
export default function TabsLayout() {
  return <ShellTabs />;
}
