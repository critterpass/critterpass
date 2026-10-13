import { PremiumStack } from '@/ui/premium/shell/navigation/premium-stack';
import { SessionGate } from '@/ui/premium/shell/session-gate';

/** Crew plans, shared plans and plan links, pushed over the tabs or opened by a link; session-only. */
export default function CommunityLayout() {
  return (
    <SessionGate>
      <PremiumStack />
    </SessionGate>
  );
}
