/**
 * The swipe deck's pieces (4.42): a card's face (its photo, or its kind's doodle on the kind's
 * pastel, with the name band) and the two vote discs.
 */
import { View } from 'react-native';

import {
  Icon,
  NoPhoto,
  PhotoLayer,
  PREMIUM_THEMES,
  PressableScale,
  Text,
  usePremiumTheme,
} from '@/ui/premium';

import type { SwipeCardFace } from '../../swipe-view-props';
import { placeIcon } from '../../search/place-icons';
import { placeAccent } from '../components/place-tint';

const VOTE = 62;

const BAND_INK = PREMIUM_THEMES.light.color.inkSurface;

export function CardFace({ face }: { readonly face: SwipeCardFace }) {
  const theme = usePremiumTheme();
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 36,
        backgroundColor: theme.color.card,
        padding: 8,
        boxShadow: theme.shadow.card,
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: 29,
          overflow: 'hidden',
          backgroundColor: theme.color.control,
        }}
      >
        {face.photo === null ? (
          // No photo: the kit's no-photo art in the kind's colour, its pattern under the name band.
          <View style={{ flex: 1 }} testID="swipe-card-doodle">
            <NoPhoto
              doodle={placeIcon(face.category)}
              accent={placeAccent(face.category)}
              size="card"
              seed={face.poiId}
            />
          </View>
        ) : (
          <PhotoLayer media={face.photo} creditAt="top" />
        )}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              // The scrim stays dark in either scheme so the name reads in white over any photo
              // (the dark scheme's ink surface is near-white and turned the band into a grey slab).
              backgroundColor: BAND_INK,
              opacity: 0.55,
            }}
          />
          <View style={{ padding: theme.space.gap16, gap: theme.space.gap4 }}>
            <Text variant="stat" color={theme.accent.paper} numberOfLines={2}>
              {face.name}
            </Text>
            <Text variant="rowText" color={theme.accent.paper} numberOfLines={2}>
              {face.meta}
            </Text>
            {face.social === null ? null : (
              <Text variant="badge" color={theme.accent.paper}>
                {face.social}
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * The deck's two votes as drawn: a red ✕ on a paper disc and a green ✓ on ink, the same in either
 * scheme (a dark ✕ disc vanished on the dark ground).
 */
export function VoteButton(props: {
  readonly icon: 'close' | 'check';
  readonly paper: boolean;
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const theme = usePremiumTheme();
  const light = PREMIUM_THEMES.light.color;
  return (
    <PressableScale
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      testID={props.testID}
      style={{
        width: VOTE,
        height: VOTE,
        borderRadius: VOTE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: props.paper ? light.card : light.ink,
        boxShadow: theme.shadow.raised,
      }}
    >
      <Icon
        name={props.icon}
        size={26}
        color={props.paper ? light.destructive.text : theme.color.toggleOn}
      />
    </PressableScale>
  );
}
