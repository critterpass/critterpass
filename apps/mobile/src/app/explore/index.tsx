import { ExploreHomeScreen } from '@/features/explore';
import { PremiumExploreHomeView } from '@/features/explore/premium/home/explore-home-page';

/** Explore's front page: destinations by guide, search and saved places. */
export default function ExploreHomeRoute() {
  return <ExploreHomeScreen View={PremiumExploreHomeView} />;
}
