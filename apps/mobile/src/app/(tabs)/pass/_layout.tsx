import { Stack } from 'expo-router/js-stack';

import { usePremiumUi } from '@/lib/premium-ui';
import { sheetRouteOptions } from '@/ui/premium/shell';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';

const RETAKE_SHEET = sheetRouteOptions('full');

/**
 * The PASS tab's stack. The premium pass is a root screen, so on iOS it needs a native stack for
 * its large title and the glass toolbar (Edit, Settings); the current UI's pass draws its own top.
 */
export default function PassLayout() {
  if (usePremiumUi()) {
    return (
      <PremiumStack>
        <PremiumStackScreen name="retake" options={RETAKE_SHEET} />
      </PremiumStack>
    );
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
