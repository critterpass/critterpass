/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { View } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { registerFixture } from '../gallery/registry';
import { Hatch } from '../textures/hatch';
import { Viewfinder } from './Viewfinder';

const feed = <Hatch baseColor={tokens.color.map.parksWater} />;

registerFixture('Viewfinder', 'encounter', () => (
  <View style={{ height: 420 }}>
    <Viewfinder
      mode="Encounter"
      context="You're at Tirta Empul"
      pinging
      accessibilityLabel="Camera"
    >
      {feed}
    </Viewfinder>
  </View>
));
