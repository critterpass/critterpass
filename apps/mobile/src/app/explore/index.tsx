import { ExploreHomeScreen, LocalFirstGate } from '@/features/explore';

/** Explore's front page: destinations by guide, search and saved places. */
export default function ExploreHomeRoute() {
  return (
    <LocalFirstGate>
      <ExploreHomeScreen />
    </LocalFirstGate>
  );
}
