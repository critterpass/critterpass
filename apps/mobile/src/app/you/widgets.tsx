import { router } from 'expo-router';

import { WidgetGalleryScreen } from '@/features/home';
import { WidgetGalleryPremiumScreen } from '@/features/home/premium/widget-gallery/widget-gallery-premium-screen';
import { YOU_ROUTES } from '@/features/you';
import { premiumRoute } from '@/lib/premium-ui';

function WidgetsRoute() {
  return (
    <WidgetGalleryScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace(YOU_ROUTES.settings))}
    />
  );
}

/** Settings › Widgets (5c-5). */
export default premiumRoute({ premium: WidgetGalleryPremiumScreen, legacy: WidgetsRoute });
