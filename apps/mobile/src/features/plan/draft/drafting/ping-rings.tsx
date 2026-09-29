/**
 * The guide thinking inside two radar rings over a soft glow in its own colour (the drafting
 * screen's hero). The rings share the app's idle clock and rest still under reduced motion.
 */
import { Group, Rect, RadialGradient, vec } from '@shopify/react-native-skia';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { patterns } from '@/motion';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';
import { Sticker } from '@/ui/sticker/Sticker';
import { TextureCanvas } from '@/ui/textures/TextureCanvas';
import { makeStyles, useTheme } from '@/ui/theme';

const STICKER = 190;
const RING = 260;
const GLOW_OPACITY = 0.28;

const useStyles = makeStyles((th) => ({
  hero: {
    height: RING * 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: th.space['8'],
  },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 2,
  },
}));

/** The screen's radial glow, centred on the guide, in the guide's colour fading to the page. */
export function GuideGlow({ guide }: { readonly guide: GuideId }) {
  const theme = useTheme();
  return (
    <TextureCanvas>
      {({ width, height }) => (
        <Group opacity={GLOW_OPACITY}>
          <Rect x={0} y={0} width={width} height={height}>
            <RadialGradient
              c={vec(width / 2, RING * 0.9)}
              r={width * 0.75}
              colors={[theme.guide[guide], 'transparent']}
            />
          </Rect>
        </Group>
      )}
    </TextureCanvas>
  );
}

export function GuideInRings({
  guide,
  active,
}: {
  readonly guide: GuideId;
  readonly active: boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const rings = patterns.usePingRings(active);
  const info = GUIDE_STICKERS[guide];
  return (
    <View style={styles.hero} testID="drafting-guide">
      {rings.map((ring) => (
        <Animated.View
          key={ring.key}
          pointerEvents="none"
          style={[styles.ring, { borderColor: theme.guide[guide] }, ring.style]}
        />
      ))}
      <Sticker kind={info.kind} name={info.name} pose="think" size={STICKER} />
    </View>
  );
}
