import { PremiumStack } from '@/ui/premium/shell/navigation/premium-stack';
import { SessionGate } from '@/ui/premium/shell/session-gate';

/** GO, pushed from a plan stop, the leave-by alarm or a notification; session-only. */
export default function GoLayout() {
  return (
    <SessionGate>
      <PremiumStack />
    </SessionGate>
  );
}
