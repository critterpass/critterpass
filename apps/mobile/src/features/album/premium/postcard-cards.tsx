/**
 * The premium postcard (8.14): its back on paper at a tilt (the note in the guide's hand, the
 * sender's initial, a dashed stamp box holding the trip's guide, a postmark and address lines)
 * and its front over it (a white-framed photo, "Greetings from" and the place in big letters).
 * Tapping the front picks the photo, the back edits the note; the format sets the front's shape.
 * A received postcard passes no handlers and is drawn read-only.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import {
  CritterSticker,
  PressableScale,
  RoundStamp,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import { AlbumImage } from '../grid/album-image';
import type { PostcardViewProps } from '../postcard/postcard-look';

const RATIO = { classic: 320 / 216, square: 1, story: 9 / 16 } as const;
const BACK_TILT = 4;
const FRONT_TILT = -4;

const useStyles = makePremiumStyles((th) => ({
  back: {
    width: '86%',
    aspectRatio: 320 / 210,
    alignSelf: 'flex-end',
    flexDirection: 'row',
    padding: 14,
    gap: 12,
    borderRadius: 10,
    backgroundColor: th.accent.paper,
    boxShadow: th.shadow.raised,
  },
  divider: { width: 1, backgroundColor: th.color.fieldBorder },
  stamp: {
    width: 52,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: th.color.outlineEmpty,
  },
  address: { height: 1, backgroundColor: th.color.fieldBorder, marginTop: 14 },
  front: {
    width: '86%',
    marginTop: -40,
    padding: 8,
    borderRadius: 12,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.float,
  },
  photo: {
    flex: 1,
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 12,
    backgroundColor: th.color.inkSurface,
  },
}));

export type PostcardCardsProps = Pick<
  PostcardViewProps,
  'format' | 'photoKey' | 'photoCaption' | 'place' | 'note' | 'signature' | 'guide'
> & {
  readonly onNote?: (() => void) | undefined;
  readonly onPhoto?: (() => void) | undefined;
};

export function PostcardCards(props: PostcardCardsProps) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const art = guideSticker(props.guide);
  return (
    <View testID="postcard-pair">
      <PressableScale
        style={[styles.back, { transform: [{ rotate: `${BACK_TILT}deg` }] }]}
        {...(props.onNote === undefined
          ? {}
          : {
              onPress: props.onNote,
              accessibilityRole: 'button' as const,
              accessibilityLabel: t({
                id: 'album.premium.postcard.editNote',
                message: 'Edit the note',
              }),
            })}
        testID="postcard-back"
      >
        <View style={{ flex: 1, justifyContent: 'space-between' }}>
          <Text variant="guide" color={th.color.status.maybe.text} numberOfLines={5}>
            {props.note}
          </Text>
          <Text variant="guide" color={th.color.status.maybe.text}>
            {props.signature}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={{ width: 96, alignItems: 'flex-end' }}>
          <View style={styles.stamp}>
            <CritterSticker kind={art.kind} name={art.name} size={46} />
          </View>
          <View style={{ position: 'absolute', top: 30, left: -8 }} pointerEvents="none">
            <RoundStamp
              word={props.place.slice(0, 3).toLocaleUpperCase()}
              size={58}
              ink="orange"
              rotate={-14}
            />
          </View>
          <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
            <View style={styles.address} />
            <View style={styles.address} />
            <View style={styles.address} />
          </View>
        </View>
      </PressableScale>
      <PressableScale
        style={[
          styles.front,
          { aspectRatio: RATIO[props.format], transform: [{ rotate: `${FRONT_TILT}deg` }] },
        ]}
        {...(props.onPhoto === undefined
          ? {}
          : {
              onPress: props.onPhoto,
              accessibilityRole: 'button' as const,
              accessibilityLabel: t({
                id: 'album.premium.postcard.pickPhoto',
                message: 'Pick the photo',
              }),
            })}
        testID="postcard-front"
      >
        <View style={styles.photo}>
          {props.photoKey === null ? null : (
            <AlbumImage mediaKey={props.photoKey} failureLine={false} />
          )}
          <Text variant="guide" tone="onInk">
            {t({ id: 'album.premium.postcard.greetings', message: 'Greetings from' })}
          </Text>
          <Text variant="hero" tone="onInk" numberOfLines={1} adjustsFontSizeToFit>
            {props.place.toLocaleUpperCase()}
          </Text>
        </View>
      </PressableScale>
      {props.photoCaption === null ? null : (
        <Text variant="captionMuted" tone="muted" align="center" style={{ marginTop: 6 }}>
          {props.photoCaption}
        </Text>
      )}
    </View>
  );
}
