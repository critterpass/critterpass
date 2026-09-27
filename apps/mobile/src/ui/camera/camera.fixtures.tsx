/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useEffect } from 'react';
import { View } from 'react-native';
import { useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { registerFixture } from '../gallery/registry';
import { Icon } from '../icons/Icon';
import { Hatch } from '../textures/hatch';
import { ArLabels } from './ArLabels';
import { ScanOverlay } from './ScanOverlay';
import { VoiceOrb } from './VoiceOrb';
import { Viewfinder } from './Viewfinder';

const feed = <Hatch baseColor={tokens.color.map.parksWater} />;

function OrbDemo({ state }: { readonly state: 'listening' | 'thinking' }) {
  const level = useSharedValue(0.3);
  useEffect(() => {
    level.value = withRepeat(withTiming(0.9, { duration: tokens.motion.duration.slow }), -1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- level is a stable shared value ref.
  }, []);
  return (
    <VoiceOrb
      level={level}
      state={state}
      stateLabel={state === 'listening' ? 'Listening' : 'Thinking'}
      transcript="It's pouring in Ubud. What now?"
      sticker={<Icon name="spark" size={64} decorative />}
    />
  );
}

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
registerFixture('ScanOverlay', 'reading a receipt', () => (
  <View style={{ height: 420 }}>
    <ScanOverlay
      scanning
      lines={[
        { id: '1', top: 0.3, height: 0.06 },
        { id: '2', top: 0.38, height: 0.06 },
        { id: '3', top: 0.46, height: 0.06 },
      ]}
    >
      {feed}
    </ScanOverlay>
  </View>
));
registerFixture('ArLabels', 'menu translation', () => (
  <View style={{ height: 420 }}>
    <ArLabels
      labels={[
        { id: '1', x: 0.1, y: 0.2, source: 'Nasi campur', text: 'Mixed rice plate' },
        { id: '2', x: 0.1, y: 0.4, source: 'Sate lilit', text: 'Minced fish satay' },
        {
          id: '3',
          x: 0.1,
          y: 0.6,
          source: 'Gado-gado',
          text: 'Veg, peanut sauce',
          notes: [
            { label: 'Jordan ✓ veg', clash: false },
            { label: 'Alex ✕ peanuts', clash: true },
          ],
        },
      ]}
    >
      {feed}
    </ArLabels>
  </View>
));
registerFixture('VoiceOrb', 'listening', () => <OrbDemo state="listening" />);
registerFixture('VoiceOrb', 'thinking', () => <OrbDemo state="thinking" />);
