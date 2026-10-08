/**
 * The photo at the top of a place's page (the old page and the planning one), pushing in slowly as
 * the page opens, with its credit and the "not this place" label. A place with no photo shows its
 * kind's doodle on the kind's colour.
 *
 * The credit is always readable: it sits at the bottom of the photo on a line of its own, above
 * the sheet's overlap and above anything the page draws on the photo there (the old page's chips),
 * never in the status-bar band and never on the header buttons' row. `heroCaptionInset` is the one
 * rule both pages take that position from. When a generic photo also carries a credit, the label
 * takes the line above it, so the two never share a line.
 */
import { tokens } from '@cp/design-tokens';
import type { PlaceMediaAsset } from '@cp/domain';
import { useEffect, useState } from 'react';
import { Image, PixelRatio, Pressable, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { bezierEasing } from '@/motion';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { savedMediaUri } from '@/lib/media/media-files';
import { Icon } from '@/ui/icons/Icon';
import { useLightbox, useOpenPhotoLabel } from '@/ui/media/lightbox/use-lightbox';
import { MediaLayer } from '@/ui/media/MediaLayer';
import { Hatch } from '@/ui/textures/hatch';
import { makeStyles, useTheme } from '@/ui/theme';

import { categoryIcon } from '../category';
import { CATEGORY_ACCENT } from '../place-detail/category-accent';
import { heroPhotoItems } from '../place-lightbox';
import { isGenericPhoto } from '../place-photo';
import { GenericPhotoLabel } from './generic-photo-label';

const PUSH_IN = 1.08;
const pushEasing = bezierEasing(tokens.motion.easing.standard);

/** How far the page's sheet rides up over the bottom of the photo. */
export const HERO_SHEET_OVERLAP = tokens.space['32'];
/** The gap between the caption line and what is under it. */
const HERO_CAPTION_GAP = tokens.space['6'];
/** A caption line with its plate, and the gap to the next one. */
const HERO_CAPTION_LINE = 18 + tokens.space['4'];

/**
 * How far from the photo's bottom edge its caption line sits: above the sheet's overlap, plus the
 * height of whatever the page draws on the photo above the sheet (`onPhoto`: the old page's chip
 * rows with their gap; nothing on the planning page, whose chips are in the sheet).
 */
export function heroCaptionInset(onPhoto = 0): number {
  return HERO_SHEET_OVERLAP + onPhoto + HERO_CAPTION_GAP;
}

const useStyles = makeStyles(() => ({
  fill: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 },
  doodle: { alignItems: 'center', justifyContent: 'center' },
}));

export interface PlacePhotoProps {
  /** The place's own asset; null draws the live photo or the category's doodle. */
  readonly photo: PlaceMediaAsset | null;
  readonly heroUrl?: string | null | undefined;
  /** Where the live photo is from, shown with it in the full-screen view. */
  readonly heroCredit?: string | undefined;
  readonly category: string;
  readonly accent: string;
  /** From `heroCaptionInset`. */
  readonly captionInset: number;
}

export function PlacePhoto({
  photo,
  heroUrl: liveUrl,
  heroCredit,
  category,
  accent,
  captionInset,
}: PlacePhotoProps) {
  const styles = useStyles();
  // A live photo that fails to load gives way to the kind's tile, and is not offered full screen.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const heroUrl = liveUrl == null || liveUrl === failedUrl ? null : liveUrl;
  const openLabel = useOpenPhotoLabel();
  const pixels = useWindowDimensions().width * PixelRatio.get();
  const items = heroPhotoItems({
    photo,
    generic: isGenericPhoto(photo),
    heroUrl,
    heroCredit,
    pixels,
    savedUri: (url) => (photo === null ? null : savedMediaUri(photo.id, url)),
  });
  const lightbox = useLightbox(items, 'place-hero-lightbox');
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = reduced
      ? 1
      : withTiming(PUSH_IN, { duration: tokens.motion.duration.story, easing: pushEasing });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scale is a stable shared value ref.
  }, [reduced]);
  const swatch = theme.color[CATEGORY_ACCENT[category] ?? 'blue'];
  const tile = typeof swatch === 'string' ? swatch : swatch.base;
  const push = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const credited = photo?.attribution_required === true;
  return (
    <Animated.View style={[styles.fill, push]}>
      <Hatch />
      <MediaLayer
        media={photo}
        surface="dark"
        accent={accent}
        tone="colour"
        dots={false}
        creditAt="bottom"
        creditInset={captionInset}
        testID="explore-place-hero"
      />
      <GenericPhotoLabel
        photo={photo}
        at="bottom"
        inset={captionInset + (credited && isGenericPhoto(photo) ? HERO_CAPTION_LINE : 0)}
      />
      {photo === null && heroUrl ? (
        <Image
          source={{ uri: heroUrl }}
          style={styles.fill}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          onError={() => setFailedUrl(heroUrl)}
          testID="explore-place-hero-live"
        />
      ) : photo === null ? (
        // No photo of its own and none live: the kind's own tile, in the kind's colour.
        <View
          style={[styles.fill, styles.doodle, { backgroundColor: tile }]}
          testID="explore-place-hero-tile"
        >
          <Icon
            name={categoryIcon(category)}
            size={72}
            color={theme.semantic.text.onAccent}
            decorative
          />
        </View>
      ) : null}
      {items[0] === undefined ? null : (
        <Pressable
          style={styles.fill}
          accessibilityRole="imagebutton"
          accessibilityLabel={openLabel()}
          onPress={() => lightbox.open(items[0]?.key ?? '')}
          testID="explore-place-hero-open"
        />
      )}
      {lightbox.viewer}
    </Animated.View>
  );
}
