/**
 * Swipe together for a trip: joins the open session (or starts one), shows the deck the guide
 * ranked with each place's own photo, sends each swipe, and stamps a match when enough of the crew
 * said yes. Every yes saves the place to the trip's Ideas under the swiper's name at once; a match
 * adds everyone else who said yes (an earlier match keeps the day it was suggested for). The verdicts this phone gave are kept on the phone; everyone's yes
 * votes and the matches come from the synced trip.
 */
import { SwipeView } from '../components/swipe-view';
import { useSwipeScreen, type SwipeScreenProps } from '../use-swipe-screen';

export type { SwipeScreenProps };

export function SwipeScreen(props: SwipeScreenProps) {
  return <SwipeView {...useSwipeScreen(props)} />;
}
