import { PremiumStack } from '@/ui/premium/shell/navigation/premium-stack';
import { SessionGate } from '@/ui/states/SessionGate';

/** The help centre and feedback, pushed from Settings; session-only. */
export default function HelpCentreLayout() {
  return (
    <SessionGate>
      <PremiumStack />
    </SessionGate>
  );
}
