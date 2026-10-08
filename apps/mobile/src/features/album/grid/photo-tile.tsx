/**
 * One photo in the album grid: its thumbnail (a signed read URL), the uploader's avatar chip in
 * the corner and a quick glint when it becomes a pick. Tap opens the viewer; long-press shows
 * who's in it. Memoised with handlers that take the photo's id, so a grid of hundreds redraws only
 * the tiles whose photo changed.
 */
import { tokens } from '@cp/design-tokens';
import { t } from '@lingui/core/macro';
import { memo, useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { Avatar } from '@/ui/people/Avatar';
import { degrees, makeStyles, useTheme } from '@/ui/theme';

import type { AlbumPhoto } from '../data/album-model';
import { AlbumImage } from './album-image';

const GLINT_MS = tokens.motion.duration.extra;

export interface PhotoTileProps {
  readonly photo: AlbumPhoto;
  readonly uploaderName: string;
  readonly uploaderIndex: number;
  /** Fallback colour while the thumbnail loads. */
  readonly tint: string;
  readonly width: number;
  readonly height: number;
  readonly onOpen: (photoId: string) => void;
  readonly onWho: (photoId: string) => void;
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

export const PhotoTile = memo(function PhotoTile({
  photo,
  uploaderName,
  uploaderIndex,
  tint,
  width,
  height,
  onOpen,
  onWho,
}: PhotoTileProps) {
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const sweep = useSharedValue(-1);
  // The photo this tile last showed: a recycled tile taking another photo never glints for it.
  const shown = useRef({ id: photo.id, isPick: photo.isPick });

  useEffect(() => {
    const before = shown.current;
    if (before.id === photo.id && photo.isPick && !before.isPick && !reduced) {
      sweep.value = -1;
      sweep.value = withTiming(1, { duration: GLINT_MS });
    }
    shown.current = { id: photo.id, isPick: photo.isPick };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [photo.id, photo.isPick, reduced]);

  const glint = useAnimatedStyle(() => ({
    opacity: sweep.value <= -1 || sweep.value >= 1 ? 0 : 1,
    transform: [{ translateX: sweep.value * 220 }],
  }));

  const label = photo.isPick
    ? t({ id: 'album.tile.pick', message: `A pick, from ${uploaderName}` })
    : t({ id: 'album.tile.photo', message: `Photo from ${uploaderName}` });

  return (
    <View style={[styles.tile, { backgroundColor: tint, width, height }]}>
      <Pressable
        style={styles.fill}
        onPress={() => onOpen(photo.id)}
        onLongPress={() => onWho(photo.id)}
        accessibilityRole="imagebutton"
        accessibilityLabel={label}
        accessibilityHint={t({
          id: 'album.tile.hint',
          message: "Opens the photo. Hold to see who's in it",
        })}
        testID={`album-photo-${photo.id}`}
      >
        <AlbumImage mediaKey={photo.thumbKey ?? photo.displayKey} />
        <Animated.View pointerEvents="none" style={[styles.glint, glint]} />
        <View style={styles.chip}>
          <Avatar
            name={uploaderName}
            uid={photo.uploaderId}
            joinIndex={uploaderIndex}
            size="sm"
            decorative
          />
        </View>
        {photo.uploadState === 'pending' ? (
          <View style={[styles.fill, { backgroundColor: theme.color.scrim.hex }]} />
        ) : null}
      </Pressable>
    </View>
  );
});
