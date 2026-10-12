/** "What's in each" (4e-2) on the current UI: the shared state in a rising modal. */
import { RiseModal } from '@/ui/sheet/RiseModal';

import { CompareView } from './compare-view';
import { useCompareScreen } from './use-compare-screen';

export function CompareScreen() {
  return (
    <RiseModal testID="compare-rise">
      <CompareView {...useCompareScreen()} />
    </RiseModal>
  );
}
