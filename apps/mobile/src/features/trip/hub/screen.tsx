/**
 * The trip hub (3k-1) over synced rows: the phase header and its countdown, the next thing, the
 * guide's briefing with its chips, the PLAN / BOOKINGS / MONEY tiles plus registered ones, and the
 * crew's ticker. With no signal on a trip day the header gives way to the offline card; any other
 * day the hub stays and says so. A called-off trip keeps its name, dates, chat, bookings and money.
 */
import { heroAt } from '@/data/media/use-subject-media';
import { VisitConsentRow } from '@/ui/permission-primer';

import { OfflineView } from '../offline/offline-view';
import { guideColour } from './guide';
import { HubView } from './hub-view';
import { HubTile } from './tiles';
import { useTripMenu } from './trip-menu';
import { useTripHub } from './use-trip-hub';

export interface TripHubScreenProps {
  readonly tripId: string;
  readonly onSwitch: (() => void) | null;
}

export function TripHubScreen({ tripId, onSwitch }: TripHubScreenProps) {
  const hub = useTripHub(tripId, onSwitch);
  const { trip, offline } = hub;
  const offlineNode = offline === null ? null : <OfflineView {...offline} />;
  const offlineCard = hub.dayCard ? offlineNode : null;
  // No role until the trip row is in: the menu offers nothing while it loads.
  const menu = useTripMenu({
    tripId,
    status: trip?.status ?? '',
    role: trip?.role ?? null,
    me: hub.me,
  });
  const tiles = [
    ...hub.builtTiles.map((tile) => ({ key: tile.key, node: <HubTile tile={tile} /> })),
    ...(trip === null
      ? []
      : hub.registeredTiles.map(({ key, Tile }) => ({
          key,
          node: <Tile tripId={tripId} crewId={trip.crew_id} />,
        }))),
  ];
  return (
    <HubView
      state={hub.rows.loaded && trip !== null ? 'ready' : 'loading'}
      header={hub.header}
      startDate={trip?.start_date ?? null}
      endDate={trip?.end_date ?? null}
      going={hub.rows.going}
      // A trip still choosing its place asks the crew's question (Home's heading while voting).
      destination={hub.destination}
      colour={guideColour(hub.guide)}
      heroMedia={heroAt(hub.heroMedia.items)}
      mediaLowData={hub.mediaLowData}
      guide={hub.guide}
      guideName={hub.guideName}
      guestGuide={trip?.is_guest_guide === 1}
      planning={hub.planning}
      crewSize={hub.rows.members.length}
      entries={hub.entries}
      disruptions={hub.disruptions}
      offlinePill={hub.offlinePill}
      briefing={hub.briefing}
      onAct={hub.onAct}
      tiles={tiles}
      explore={hub.explore}
      swipe={hub.swipe}
      visitConsent={hub.calledOff ? null : <VisitConsentRow />}
      ticker={hub.ticker}
      onSwitch={hub.switchTrip}
      {...(offlineCard === null ? {} : { offlineCard })}
      {...(hub.unread ? { offlineConflicts: offlineNode } : {})}
      menu={menu.foot}
      menuSheet={menu.sheet}
    />
  );
}
