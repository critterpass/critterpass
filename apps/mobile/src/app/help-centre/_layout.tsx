import { PremiumStack } from '@/ui/premium/shell/navigation/premium-stack';
import { SessionGate } from '@/ui/premium/shell/session-gate';

/** The help centre and feedback, pushed from Settings; session-only. */
export default function HelpCentreLayout() {
  return (
    <SessionGate>
      <PremiumStack />
    </SessionGate>
  );
}
