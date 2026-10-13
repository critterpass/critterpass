/* eslint-disable lingui/no-unlocalized-strings -- route names, not copy. */
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
 * stack: the `+` sheet, paste, the link code and the mailbox are native form sheets, and the
 * boarding pass is a tall native sheet with its ✕ that swipes down.
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
          <PremiumStackScreen name="paste" options={sheetRouteOptions('fit')} />
          <PremiumStackScreen name="link-code" options={sheetRouteOptions('fit')} />
          <PremiumStackScreen name="mailbox" options={sheetRouteOptions('full')} />
          <PremiumStackScreen name="pass/[id]" options={sheetRouteOptions('full')} />
        </PremiumStack>
      ) : (
        <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />
      )}
    </BookingsServicesProvider>
  );
}
