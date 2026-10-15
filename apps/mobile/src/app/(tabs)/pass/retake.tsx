import { LocalFirstGate } from '@/features/critters/local-first-gate';
import { RetakePremiumSheet } from '@/features/you/premium/profile/retake-premium-sheet';

/** Retake "How you travel" from the pass, as a form sheet over it. */
export default function RetakeRoute() {
  return (
    <LocalFirstGate>
      <RetakePremiumSheet />
    </LocalFirstGate>
  );
}
