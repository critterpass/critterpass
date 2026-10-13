import { ExploreHomeScreen } from '@/features/explore';
import { PremiumExploreHomeView } from '@/features/explore/premium/home/explore-home-page';
import { usePremiumUi } from '@/lib/premium-ui';

/** Explore's front page: destinations by guide, search and saved places. */
export default function ExploreHomeRoute() {
  const premium = usePremiumUi();
  return <ExploreHomeScreen {...(premium ? { View: PremiumExploreHomeView } : {})} />;
}
