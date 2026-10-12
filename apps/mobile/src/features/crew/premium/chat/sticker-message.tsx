/**
 * A critter sticker in the chat (5.01, 5.09): no bubble, the sticker tilted (−6° for yours, +5°
 * for others'), its pose caption on an ink tag counter-rotated at its foot. A sticker that just
 * arrived lands with a little pop on the Lively spring (scale .6 → 1, tilt 0 → its angle); with
 * Reduce Motion it fades in.
 */
import type { StickerPose } from '@cp/domain';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import {
  CritterSticker,
  REDUCED_FADE,
  SPRINGS,
  Text,
  makePremiumStyles,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { stickerCaption } from '../../chat/cards/sticker-caption';
import { useStickerArt } from '../../chat/data/use-sticker-form';

export const STICKER_TILT_MINE = -6;
export const STICKER_TILT_THEIRS = 5;

const useStyles = makePremiumStyles((th) => ({
  tag: {
    position: 'absolute',
    bottom: th.space.gap4,
    alignSelf: 'center',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 9,
    borderWidth: th.size.stickerBorder,
    borderColor: th.accent.stickerEdge,
    backgroundColor: th.color.inkSurface,
    boxShadow: th.shadow.sticker,
  },
}));

export interface StickerArtViewProps {
  readonly formId: string;
  readonly pose: StickerPose;
  readonly size: number;
  readonly tilt?: number;
  readonly caption?: boolean;
}

/** The sticker art with its caption tag, at rest. */
export function StickerArtView({
  formId,
  pose,
  size,
  tilt = 0,
  caption = true,
}: StickerArtViewProps) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const art = useStickerArt(formId);
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ transform: [{ rotate: `${tilt}deg` }] }}>
        {art === null ? (
          <View style={{ width: size, height: size }} />
        ) : (
          <CritterSticker
            kind={art.kind}
            name={art.name}
            size={size}
            pose={pose}
            {...(art.seed === null ? {} : { seed: art.seed })}
            {...(art.form === null ? {} : { form: art.form })}
          />
        )}
      </View>
      {caption ? (
        <View style={[styles.tag, { transform: [{ rotate: `${-1.6 * tilt}deg` }] }]}>
          <Text variant="tier" color={th.color.onInkSurface}>
            {stickerCaption(pose).toLocaleUpperCase()}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export interface StickerMessageProps extends StickerArtViewProps {
  /** A sticker that arrived while the chat was open lands with the pop. */
  readonly animate: boolean;
}

export function StickerMessage({ animate, tilt = 0, ...props }: StickerMessageProps) {
  const reduced = usePremiumReducedMotion();
  const progress = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) return;
    progress.value = reduced ? withTiming(1, REDUCED_FADE) : withSpring(1, SPRINGS.lively);
  }, [animate, reduced, progress]);
  const style = useAnimatedStyle(() =>
    reduced
      ? { opacity: progress.value }
      : {
          opacity: Math.min(1, progress.value * 2),
          transform: [
            { scale: 0.6 + 0.4 * progress.value },
            { rotate: `${(1 - progress.value) * -tilt}deg` },
          ],
        },
  );
  return (
    <Animated.View style={style}>
      <StickerArtView {...props} tilt={tilt} />
    </Animated.View>
  );
}
