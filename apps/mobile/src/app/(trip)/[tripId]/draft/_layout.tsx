import { Stack } from 'expo-router/js-stack';

import { deviceDraftServices, DraftServicesProvider } from '@/features/plan/draft';
import { sheetScreens } from '@/lib/navigation/sheet-routes';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { usePremiumUi } from '@/lib/premium-ui';
import { useMotionMode } from '@/motion/motion-mode';
import { sheetRouteOptions } from '@/ui/premium/shell';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';
import { useTheme } from '@/ui/theme';

/** The private draft: drafting, the draft, a redraft; change-a-day and the last redraft as sheets. */
export default function DraftLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  const premium = usePremiumUi();
  return (
    <DraftServicesProvider services={deviceDraftServices}>
      {premium ? (
        // Native pushes with the glass back; the two sheets are native form sheets.
        <PremiumStack>
          <PremiumStackScreen name="change-day" options={sheetRouteOptions('full')} />
          <PremiumStackScreen name="last-redraft" options={sheetRouteOptions('fit')} />
        </PremiumStack>
      ) : (
        <Stack screenOptions={pushTransition(motion, motionMode !== 'full')}>
          {/* eslint-disable-next-line lingui/no-unlocalized-strings -- a navigator's path, never copy. */}
          {sheetScreens('(trip)/[tripId]/draft').map((name) => (
            <Stack.Screen key={name} name={name} options={modalGroupOptions()} />
          ))}
        </Stack>
      )}
    </DraftServicesProvider>
  );
}
