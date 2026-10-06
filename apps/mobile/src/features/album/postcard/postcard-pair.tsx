/**
 * The postcard as 3m-9 draws it: the front (the photo, or the guide's colour when there is none,
 * "Greetings from" over the place, the guide sticker) above its back (the note in hand lettering,
 * the sender's initial, this trip's guide as the stamp), tilted and overlapping. The back turns
 * over every few seconds with a small bounce. Tapping the front picks the photo; tapping the back
 * edits the note. Formats change the front's shape: postcard 3:2, poster square, story 9:16.
 */
import { tokens } from '@cp/design-tokens';
import type { POSTCARD_FORMATS } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { Image, Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { guideSticker } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';
import { Sticker } from '@/ui/sticker/Sticker';
import { SurfaceToneProvider } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { paperColours } from '@/ui/documents/paper-colours';
import { makeStyles, useTheme } from '@/ui/theme';

import { useAlbumReadUrl } from '../grid/album-media';

export type PostcardFormat = (typeof POSTCARD_FORMATS)[number];

const BOUNCE_EVERY_MS = tokens.motion.duration.story;
const RATIO: Readonly<Record<PostcardFormat, number>> = { classic: 1.5, square: 1, story: 9 / 16 };

export interface PostcardPairProps {
  readonly format: PostcardFormat;
  readonly photoKey: string | null;
  /** "photo · Batur at sunrise" under the front; null without a photo. */
  readonly photoCaption: string | null;
  readonly place: string;
  readonly note: string;
  readonly signature: string;
  readonly guide: GuideId;
  readonly onFront?: () => void;
  readonly onBack?: () => void;
}

const useStyles = makeStyles((t) => ({
  wrap: { alignItems: 'center' },
  front: {
    width: '100%',
    borderRadius: t.radius.md,
    borderWidth: t.space['8'],
    borderColor: t.color.paper.bright,
    overflow: 'hidden',
  },
  fill: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 },
  greeting: { position: 'absolute', start: t.space['14'], top: t.space['10'] },
  sticker: { position: 'absolute', end: t.space['10'], top: t.space['10'] },
  caption: { position: 'absolute', start: t.space['10'], bottom: t.space['8'] },
  back: {
    width: '92%',
    marginTop: -t.space['24'],
    aspectRatio: 1.75,
    borderRadius: t.radius.sm,
    backgroundColor: t.color.paper.warm,
    flexDirection: 'row',
    padding: t.space['14'],
    gap: t.space['12'],
  },
  divider: { width: 1, backgroundColor: paperColours(t).border },
  stamp: {
    alignSelf: 'flex-end',
    padding: t.space['4'],
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: t.color.pink,
    backgroundColor: t.color.yellow,
  },
  line: { height: 1, backgroundColor: paperColours(t).border, marginTop: t.space['14'] },
}));

export function PostcardPair(props: PostcardPairProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const url = useAlbumReadUrl(props.photoKey);
  const art = guideSticker(props.guide);
  const turn = useSharedValue(reduced ? 1 : 0);
  const bounce = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      turn.value = 1;
      bounce.value = 0;
      return;
    }
    turn.value = withTiming(1, { duration: tokens.motion.duration.medium });
    bounce.value = withRepeat(
      withSequence(
        withDelay(BOUNCE_EVERY_MS, withTiming(1, { duration: tokens.motion.duration.instant })),
        withTiming(0, { duration: tokens.motion.duration.fast }),
      ),
      -1,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [reduced]);

  const frontStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: turn.value }] }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-4 + bounce.value * 2}deg` }, { scale: 1 + bounce.value * 0.03 }],
  }));

  return (
    <View style={styles.wrap} testID="postcard-pair">
      <Animated.View
        style={[
          styles.front,
          { aspectRatio: RATIO[props.format], backgroundColor: art.accent },
          props.format === 'story' ? { width: '62%' } : null,
          frontStyle,
        ]}
      >
        <Pressable
          style={styles.fill}
          onPress={props.onFront}
          disabled={props.onFront === undefined}
          accessibilityRole="button"
          accessibilityLabel={t({ id: 'album.postcard.front', message: 'Choose the photo' })}
          testID="postcard-front"
        >
          {url === null ? null : <Image source={{ uri: url }} style={styles.fill} />}
          <View style={styles.greeting}>
            <Text variant="voicePostcard" color={theme.color.paper.bright}>
              {t({ id: 'album.postcard.greetings', message: 'Greetings from' })}
            </Text>
            <Text variant="displayXl" color={theme.color.yellow} singleLine={false}>
              {props.place}
            </Text>
          </View>
          <View style={styles.sticker}>
            <Sticker kind={art.kind} name={art.name} size={56} pose="cheer" />
          </View>
          {props.photoCaption === null ? null : (
            <View style={styles.caption}>
              <Text variant="monoData" color={theme.color.paper.bright}>
                {props.photoCaption}
              </Text>
            </View>
          )}
        </Pressable>
      </Animated.View>
      <Animated.View style={[styles.back, backStyle]}>
        <SurfaceToneProvider value="paper">
          <Pressable
            style={{ flex: 1.3 }}
            onPress={props.onBack}
            disabled={props.onBack === undefined}
            accessibilityRole="button"
            accessibilityLabel={t({ id: 'album.postcard.back', message: 'Write the note' })}
            testID="postcard-back"
          >
            <Text variant="voice" color={theme.color.paper.ink}>
              {props.note.length > 0
                ? `${props.note} — ${props.signature}`
                : t({ id: 'album.postcard.noteEmpty', message: 'Tap to write a note…' })}
            </Text>
          </Pressable>
          <View style={styles.divider} />
          <View style={{ flex: 1 }}>
            <View style={styles.stamp}>
              <Sticker kind={art.kind} name={art.name} size={36} pose="cheer" />
            </View>
            <View style={styles.line} />
            <View style={styles.line} />
          </View>
        </SurfaceToneProvider>
      </Animated.View>
    </View>
  );
}
