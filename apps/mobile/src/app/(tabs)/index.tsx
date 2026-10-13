import { useLocalSearchParams } from 'expo-router';

import { HomePremiumScreen } from '@/features/home/premium/home-premium-screen';
import { useLinkNotice } from '@/features/home/link-notice';
import { registerHomeScreens } from '@/features/home/routes';
import { useSplashRevealed } from '@/features/onboarding/hatch/launch-state';

registerHomeScreens();

/**
 * The HOME tab (3.01–3.04); `?crewId=` shows a crew a link handed off
 * to and `?notice=` (with `at`) says once why a link ended up here.
 */
function useHomeRoute(): string | null {
  const params = useLocalSearchParams<{ crewId?: string; notice?: string; at?: string }>();
  // Said once the launch screen has gone: a cold start from a link mounts Home underneath it.
  useLinkNotice(
    {
      notice: typeof params.notice === 'string' ? params.notice : null,
      at: typeof params.at === 'string' ? params.at : null,
    },
    useSplashRevealed(),
  );
  return typeof params.crewId === 'string' ? params.crewId : null;
}

export default function HomeRoute() {
  return <HomePremiumScreen crewId={useHomeRoute()} />;
}
