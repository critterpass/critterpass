/**
 * One photo in the album grid: its thumbnail (a signed read URL), the uploader's avatar chip in
 * the corner, a quick glint when it becomes a pick, and a small drop as it lands. Tap opens the
 * viewer; long-press shows who's in it.
 */
import { tokens } from '@cp/design-tokens';
import { t } from '@lingui/core/macro';
import { useEffect, useRef } from 'react';
import { Image, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { Avatar } from '@/ui/people/Avatar';
import { degrees, makeStyles, useTheme } from '@/ui/theme';

import type { AlbumPhoto } from '../data/album-model';
import { useAlbumReadUrl } from './album-media';

const GLINT_MS = tokens.motion.duration.extra;
const DROP_MS = tokens.motion.duration.base;

export interface PhotoTileProps {
  readonly photo: AlbumPhoto;
  readonly uploaderName: string;
  readonly uploaderIndex: number;
  /** Fallback colour while the thumbnail loads. */
  readonly tint: string;
  readonly onOpen: () => void;
  readonly onWho: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

const useStyles = makeStyles((t) => ({
  tile: { borderRadius: t.radius.md, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 },
  chip: { position: 'absolute', end: t.space['8'], bottom: t.space['8'] },
  glint: {
    position: 'absolute',
    top: -40,
    bottom: -40,
    width: 48,
    backgroundColor: t.color.paper.bright,
    opacity: 0.35,
    transform: [{ rotate: degrees(20) }],
  },
}));

export function PhotoTile({
  photo,
  uploaderName,
  uploaderIndex,
  tint,
  onOpen,
  onWho,
  style,
}: PhotoTileProps) {
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const url = useAlbumReadUrl(photo.thumbKey ?? photo.displayKey);
  const sweep = useSharedValue(-1);
  const wasPick = useRef(photo.isPick);

  useEffect(() => {
    if (photo.isPick && !wasPick.current && !reduced) {
      sweep.value = -1;
      sweep.value = withTiming(1, { duration: GLINT_MS });
    }
    wasPick.current = photo.isPick;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [photo.isPick, reduced]);

  const glint = useAnimatedStyle(() => ({
    opacity: sweep.value <= -1 || sweep.value >= 1 ? 0 : 1,
    transform: [{ translateX: sweep.value * 220 }],
  }));

  const label = photo.isPick
    ? t({ id: 'album.tile.pick', message: `A pick, from ${uploaderName}` })
    : t({ id: 'album.tile.photo', message: `Photo from ${uploaderName}` });

  return (
    <Animated.View
      {...(reduced ? {} : { entering: FadeInUp.duration(DROP_MS) })}
      style={[styles.tile, { backgroundColor: tint }, style]}
    >
      <Pressable
        style={styles.fill}
        onPress={onOpen}
        onLongPress={onWho}
        accessibilityRole="imagebutton"
        accessibilityLabel={label}
        accessibilityHint={t({
          id: 'album.tile.hint',
          message: "Opens the photo. Hold to see who's in it",
        })}
        testID={`album-photo-${photo.id}`}
      >
        {url === null ? null : <Image source={{ uri: url }} style={styles.fill} />}
        <Animated.View pointerEvents="none" style={[styles.glint, glint]} />
        <View style={styles.chip}>
          <Avatar name={uploaderName} joinIndex={uploaderIndex} size="sm" decorative />
        </View>
        {photo.uploadState === 'pending' ? (
          <View style={[styles.fill, { backgroundColor: theme.color.scrim.hex }]} />
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
