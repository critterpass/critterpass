import { PremiumStack } from '@/ui/premium/shell/navigation/premium-stack';
import { SessionGate } from '@/ui/states/SessionGate';

/** GO, pushed from a plan stop, the leave-by alarm or a notification; session-only. */
export default function GoLayout() {
  return (
    <SessionGate>
      <PremiumStack />
    </SessionGate>
  );
}
