import { Stack } from 'expo-router/js-stack';
import { useMemo } from 'react';

import { BookingsServicesProvider } from '@/features/bookings/data/services';
import { deviceBookingsServices } from '@/features/bookings/data/device-services';
import { pushTransition } from '@/lib/navigation/transitions';
import { usePremiumUi } from '@/lib/premium-ui';
import { useMotionMode } from '@/motion/motion-mode';
import { sheetRouteOptions } from '@/ui/premium/shell';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';
import { useTheme } from '@/ui/theme';

import { getOcr } from '../../../../../modules/cp-ocr';

/** A booking opened cold from a link keeps the stack under it, so back lands on Bookings. */
export const unstable_settings = { initialRouteName: 'index' };

/**
 * The BOOKINGS half of the Wallet tab: the stack, a booking, adding one and the archive push
 * inside the tab; the boarding pass rises over it as a modal route. The premium UI uses the native
 * stack, with the `+` sheet as a half-height form sheet.
 */
export default function BookingsLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  const services = useMemo(() => deviceBookingsServices(getOcr()), []);
  const premium = usePremiumUi();
  return (
    <BookingsServicesProvider services={services}>
      {premium ? (
        <PremiumStack>
          <PremiumStackScreen name="add-sheet" options={sheetRouteOptions('half')} />
        </PremiumStack>
      ) : (
        <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />
      )}
    </BookingsServicesProvider>
  );
}
