import { PremiumStack } from '@/ui/premium/shell';
import { SessionGate } from '@/ui/premium/shell/session-gate';

/**
 * Critterdex pages pushed from the PASS tab (screens owned by the critters area); session-only. A
 * native stack, so the legendary calendar's toolbar and the glass back work here.
 */
export default function CrittersLayout() {
  return (
    <SessionGate>
      <PremiumStack />
    </SessionGate>
  );
}
