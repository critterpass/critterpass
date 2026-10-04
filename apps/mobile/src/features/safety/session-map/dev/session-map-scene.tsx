/**
 * The SOS session map over fixed data, in a destination with no region pack: the sender, this
 * phone and the line between them on the world tiles, with the line that says a detailed map is on
 * its way above the card.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture names, only in the (dev) lab. */
import { WORLD_SOURCE_URL } from '@/ui/map/region-pack';

import { SessionMapView } from '../session-map';

const SENDER = { lat: 11.9436, lng: 108.4419 };
const HERE = { lat: 11.9365, lng: 108.4378 };

export function SessionMapNoPackScene() {
  return (
    <SessionMapView
      senderName="Maya"
      onClose={() => undefined}
      map={{
        sender: SENDER,
        here: HERE,
        line: [
          [HERE.lng, HERE.lat],
          [SENDER.lng, SENDER.lat],
        ],
        centre: { lat: (SENDER.lat + HERE.lat) / 2, lng: (SENDER.lng + HERE.lng) / 2 },
        zoom: 14,
        etaMin: 12,
        distanceM: 900,
        regionSourceUrl: WORLD_SOURCE_URL.replace(/^pmtiles:\/\//u, ''),
        regionPackAwaited: true,
        destinationName: 'Đà Lạt',
        ended: false,
      }}
    />
  );
}
