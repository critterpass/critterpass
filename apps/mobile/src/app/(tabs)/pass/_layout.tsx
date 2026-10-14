/* eslint-disable lingui/no-unlocalized-strings -- route names, not copy. */
import { tabSheetOptions } from '@/ui/premium/shell';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';

const RETAKE_SHEET = tabSheetOptions('pass/retake');

/**
 * The PASS tab's stack. The pass is a root screen, so on iOS it needs a native stack for its large
 * title and the glass toolbar (Edit, Settings).
 */
export default function PassLayout() {
  return (
    <PremiumStack>
      <PremiumStackScreen name="retake" options={RETAKE_SHEET} />
    </PremiumStack>
  );
}
