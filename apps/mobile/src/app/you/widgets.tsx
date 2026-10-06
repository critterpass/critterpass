import { router } from 'expo-router';

import { WidgetGalleryScreen } from '@/features/home';
import { YOU_ROUTES } from '@/features/you';

/** Settings › Widgets (5c-5). */
export default function WidgetsRoute() {
  return (
    <WidgetGalleryScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace(YOU_ROUTES.settings))}
    />
  );
}
