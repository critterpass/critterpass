/**
 * Lab scenes for the hub's states outside the trip's own phases: the crew still voting, a trip
 * called off, no signal on a day that is not a trip day, and open disruptions. Every handler is a
 * no-op.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';

import { bookingsTile, moneyTile } from '../hub-copy';
import { disruptionIcon, disruptionLabel } from '../hub-disruptions';
import { builtInTiles, chatEntry } from '../hub-screen-rows';
import { planTileWhileVoting } from '../hub-turn';
import { HubTile } from '../tiles';
import { DA_NANG, Hub } from './hub-scenes';

const noop = () => undefined;

/** The built-in tiles as the screen builds them, opening nothing. */
function sceneTiles(plan: Parameters<typeof builtInTiles>[0]['plan']) {
  return builtInTiles({
    tripId: 't1',
    plan,
    bookings: bookingsTile(2, false),
    money: moneyTile(null, 0),
  }).map((tile) => ({ key: tile.key, node: <HubTile tile={{ ...tile, onPress: noop }} /> }));
}
const votingTiles = () => sceneTiles(planTileWhileVoting());
const calledOffTiles = () => sceneTiles(null);

export const HUB_STATE_SCENES: Readonly<Record<string, () => ReactNode>> = {
  // The crew still votes on the place: no plan to open and nothing to swipe yet.
  '3k-1-voting': () => (
    <Hub
      header={{ phase: 'planning' }}
      briefing={{ kind: 'hidden' }}
      quests={false}
      overrides={{
        startDate: null,
        endDate: null,
        planning: { label: 'Voting', onPress: noop },
        tiles: votingTiles(),
      }}
    />
  ),
  // Called off: the name, the dates and what stays to read.
  '3k-1-called-off': () => (
    <Hub
      header={{ phase: 'cancelled' }}
      briefing={{ kind: 'hidden' }}
      overrides={{
        ...DA_NANG,
        entries: [{ ...chatEntry('crew'), onPress: noop }],
        tiles: calledOffTiles(),
        explore: null,
        swipe: null,
      }}
    />
  ),
  // No signal weeks before the trip: the hub stays and says so.
  '3k-1-offline-pill': () => <Hub overrides={{ offlinePill: { onPress: noop } }} />,
  // An open disruption stays one tap away after its push is gone.
  '3k-1-disruption': () => (
    <Hub
      overrides={{
        disruptions: [
          {
            icon: disruptionIcon('flight_delay'),
            label: disruptionLabel('flight_delay'),
            title: 'VN 1541 delayed 2 h 10',
            detail: null,
            tone: 'pink',
            testID: 'trip-hub-disruption-flight',
            onPress: noop,
          },
          {
            icon: disruptionIcon('storm'),
            label: disruptionLabel('storm'),
            title: 'Rough seas Friday',
            detail: null,
            tone: 'pink',
            testID: 'trip-hub-disruption-storm',
            onPress: noop,
          },
        ],
      }}
    />
  ),
};
