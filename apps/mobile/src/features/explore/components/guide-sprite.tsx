/** The destination's guide, hopping beside the you-dot on the map. */
import Animated from 'react-native-reanimated';

import { useLoop } from '@/motion';
import { Sticker } from '@/ui/sticker/Sticker';

import type { GuideFacts } from '../format';

const SPRITE = 40;

export function GuideSprite({ guide }: { readonly guide: GuideFacts }) {
  const hop = useLoop('hop');
  return (
    <Animated.View style={hop} pointerEvents="none">
      <Sticker kind={guide.kind} name={guide.name} size={SPRITE} />
    </Animated.View>
  );
}
