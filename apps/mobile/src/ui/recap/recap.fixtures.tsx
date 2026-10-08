/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */

import { registerFixture } from '../gallery/registry';
import { Icon } from '../icons/Icon';
import { RouteRider } from './RouteRider';
registerFixture('RouteRider', 'the route', () => (
  <RouteRider
    distance="214 km"
    reached={3}
    rider={<Icon name="car" size={28} decorative />}
    stops={[
      { id: 's', name: 'Seminyak', dayLabel: 'Day 1' },
      { id: 'u', name: 'Ubud', dayLabel: 'Days 2–4' },
      { id: 'b', name: 'Batur', dayLabel: 'Day 4 · 02:51', highlight: true },
      { id: 'a', name: 'Amed', dayLabel: 'Day 5' },
      { id: 'n', name: 'Nusa Penida', dayLabel: 'Day 6' },
    ]}
  />
));
