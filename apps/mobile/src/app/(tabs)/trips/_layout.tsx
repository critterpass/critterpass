import { PremiumStack } from '@/ui/premium/shell/navigation/premium-stack';

/**
 * The TRIPS tab: the trip list in a native stack (large title, glass toolbar). A trip's hub opens
 * on the root stack (`/hub/<tripId>`), so the tab bar leaves with the push.
 */
export default function TripsLayout() {
  return <PremiumStack />;
}
