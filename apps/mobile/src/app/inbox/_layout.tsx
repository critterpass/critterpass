import { PremiumStack } from '@/ui/premium/shell/navigation/premium-stack';
import { SessionGate } from '@/ui/states/SessionGate';

/**
 * The inbox, pushed from Home's bell or opened by a notification; session-only. A native stack, so
 * the page carries the native bar (glass back, "Mark all read").
 */
export default function InboxLayout() {
  return (
    <SessionGate>
      <PremiumStack />
    </SessionGate>
  );
}
