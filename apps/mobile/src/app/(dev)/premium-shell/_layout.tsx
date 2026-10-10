import { useColorScheme } from 'react-native';

import { PremiumThemeProvider } from '@/ui/premium';
import {
  FULL_SCREEN_ROUTE_OPTIONS,
  PremiumKeyboardProvider,
  PremiumStack,
  PremiumStackScreen,
  sheetRouteOptions,
  ZOOM_DESTINATION_OPTIONS,
} from '@/ui/premium/shell';

export const __CP_DEV_ROUTE__ = true;

/**
 * Developer tools: the premium shell on its own, whatever the premium switch says. Its own native
 * stack holds tabs (large titles, minimise on scroll, the guide circle) with the pages, sheets and
 * the full screen pushed over them, as the premium root stack does in the app. The theme follows
 * the phone here (a nested theme: the app's appearance is left alone).
 */
export default function PremiumShellLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return (
    <PremiumThemeProvider scheme={scheme}>
      <PremiumKeyboardProvider>
        <PremiumStack>
          <PremiumStackScreen name="(tabs)" />
          <PremiumStackScreen name="detail" options={ZOOM_DESTINATION_OPTIONS} />
          <PremiumStackScreen name="sheet" options={sheetRouteOptions('full')} />
          <PremiumStackScreen name="add" options={sheetRouteOptions('half')} />
          <PremiumStackScreen name="guide" options={sheetRouteOptions('half')} />
          <PremiumStackScreen name="full" options={FULL_SCREEN_ROUTE_OPTIONS} />
        </PremiumStack>
      </PremiumKeyboardProvider>
    </PremiumThemeProvider>
  );
}
