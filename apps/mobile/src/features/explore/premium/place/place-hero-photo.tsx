/**
 * The photo at the top of a place's page, pushing in slowly as the page opens (at rest under
 * Reduce Motion), with its licence credit and the "Not this place" label for a generic stock
 * photo. A place with no photo of its own shows the live one, else its kind's doodle. Tapping a
 * photo the place can show full screen opens it in the kit's viewer.
 *
 * The credit always reads: it sits at the caption inset above the bottom edge (clear of the
 * sheet that rides over the photo). When a generic photo also carries a credit, the label takes
 * the line above it, so the two never share a line.
 */
import type { PlaceMediaAsset } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import {
  Image,
  Modal,
  PixelRatio,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { savedMediaUri } from '@/lib/media/media-files';
import {
  NoPhoto,
  PhotoLayer,
  PhotoViewer,
  Text,
  makePremiumStyles,
  usePremiumReducedMotion,
} from '@/ui/premium';

import { heroPhotoItems } from '../../place-lightbox';
import { isGenericPhoto } from '../../place-photo';
import { placeIcon } from '../../search/place-icons';
import { placeAccent } from '../components/place-tint';

const PUSH_IN = 1.08;
const PUSH_MS = 6000;
/** A caption line with its plate, and the gap to the next one. */
const CAPTION_LINE = 22;
/** The caption plate and its words, as the kit's photo credit draws them in both modes. */
// eslint-disable-next-line critterpass/no-literal-style, lingui/no-unlocalized-strings -- the plate's paint over pictures, which the premium tokens do not carry yet
const PLATE = 'rgba(0,0,0,.45)';
// eslint-disable-next-line critterpass/no-literal-style, lingui/no-unlocalized-strings -- the same
const ON_PLATE = '#ffffff';

const useStyles = makePremiumStyles((th) => ({
  generic: {
    position: 'absolute',
    start: th.space.gap12,
    paddingHorizontal: th.space.gap6,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: PLATE,
  },
}));

export interface PlaceHeroPhotoProps {
  /** The place's own asset; null draws the live photo or the kind's doodle. */
  readonly photo: PlaceMediaAsset | null;
  readonly heroUrl?: string | null | undefined;
  /** Where the live photo is from, shown with it full screen. */
  readonly heroCredit?: string | undefined;
  readonly category: string;
  /** How far above the bottom edge the caption line sits. */
  readonly captionInset: number;
}

export function PlaceHeroPhoto({
  photo,
  heroUrl: liveUrl,
  heroCredit,
  category,
  captionInset,
}: PlaceHeroPhotoProps) {
  const styles = useStyles();
  const { t } = useLingui();
  const reduced = usePremiumReducedMotion();
  // A live photo that fails to load gives way to the kind's tile, and is not offered full screen.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const heroUrl = liveUrl == null || liveUrl === failedUrl ? null : liveUrl;
  const pixels = useWindowDimensions().width * PixelRatio.get();
  const generic = isGenericPhoto(photo);
  const items = heroPhotoItems({
    photo,
    generic,
    heroUrl,
    heroCredit,
    pixels,
    savedUri: (url) => (photo === null ? null : savedMediaUri(photo.id, url)),
  });
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.set(reduced ? 1 : withTiming(PUSH_IN, { duration: PUSH_MS }));
  }, [reduced, scale]);
  const push = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const credited = photo?.attribution_required === true;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, push]}>
        {photo === null && heroUrl ? (
          <Image
            source={{ uri: heroUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
            onError={() => setFailedUrl(heroUrl)}
            testID="explore-place-hero-live"
          />
        ) : photo === null ? (
          // No photo of its own and none live: the kit's no-photo art in the kind's colour.
          <View style={StyleSheet.absoluteFill} testID="explore-place-hero-tile">
            <NoPhoto doodle={placeIcon(category)} accent={placeAccent(category)} size="hero" />
          </View>
        ) : (
          <PhotoLayer
            media={photo}
            creditAt="bottom"
            creditInset={captionInset}
            testID="explore-place-hero"
          />
        )}
      </Animated.View>
      {generic ? (
        <Text
          variant="caption"
          color={ON_PLATE}
          numberOfLines={1}
          style={[styles.generic, { bottom: captionInset + (credited ? CAPTION_LINE : 0) }]}
          testID="explore-photo-generic"
        >
          {t({ id: 'explore.photo.notThisPlace', message: 'Not this place' })}
        </Text>
      ) : null}
      {items[0] === undefined ? null : (
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="imagebutton"
          accessibilityLabel={t({
            id: 'explore.premium.place.openPhoto',
            message: 'Open the photo',
          })}
          onPress={() => setOpen(true)}
          testID="explore-place-hero-open"
        />
      )}
      {open ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setOpen(false)}
          statusBarTranslucent
        >
          <PhotoViewer
            items={items}
            onClose={() => setOpen(false)}
            closeLabel={t({ id: 'explore.premium.place.closePhoto', message: 'Close' })}
            testID="place-hero-lightbox"
          />
        </Modal>
      ) : null}
    </View>
  );
}
