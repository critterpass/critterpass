import { PremiumStack } from '@/ui/premium/shell';
import { SessionGate } from '@/ui/states/SessionGate';

/**
 * A trip's year-later memory, opened by its notification; session-only. A native stack, so the
 * memory's ✕ and the pages it opens move natively; the root presents the memory itself as a tall
 * sheet that swipes down (`lib/navigation/presentation.ts`).
 */
export default function MemoryLayout() {
  return (
    <SessionGate>
      <PremiumStack navigator="memory" />
    </SessionGate>
  );
}
