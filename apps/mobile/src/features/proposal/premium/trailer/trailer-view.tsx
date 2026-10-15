/**
 * The proposal trailer in the premium look (undesigned; a full-bleed story drawn like the recap
 * story): ✕ and "{guide} presents" with the trip line under the bars, the slides, the crew's
 * latest reactions rising up as glass pills, the quick replies, and I'm in / Maybe at the foot.
 * The reads and the reactions are `TrailerScreen`'s.
 */
import { t } from '@lingui/core/macro';
import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { guideSticker } from '@/ui/premium/stickers/guides';
import {
  Button,
  CritterSticker,
  GlassIconButton,
  GlassPill,
  Text,
  usePremiumReducedMotion,
  riseIn,
} from '@/ui/premium';

import type { TrailerViewProps } from '../../trailer/trailer-screen';
import { TrailerPlayer } from './trailer-player';
import { PremiumTrailerSlide } from './trailer-slide';

/** Room the foot takes over a slide: the buttons, and the replies when open. */
const FOOT = 200;
/** The reactions shown at once, newest last. */
const FLOATS = 2;

export function PremiumTrailerView(props: TrailerViewProps) {
  const insets = useSafeAreaInsets();
  const reduced = usePremiumReducedMotion();
  const info = guideSticker(props.guide);
  const floats = props.reactions.slice(-FLOATS);
  return (
    <View style={styles.root} testID="proposal-trailer">
      <Stack.Screen options={{ headerShown: false }} />
      <TrailerPlayer
        testID="trailer-player"
        top={insets.top + 6}
        held={props.held}
        onFinished={props.onVersion}
        onClose={props.onVersion}
        segments={props.slides.map((slide) => ({
          id: slide.id,
          label: slide.label,
          content: (
            <PremiumTrailerSlide
              guide={props.guide}
              eyebrow={slide.eyebrow}
              headline={slide.headline}
              body={slide.body}
              bottom={FOOT + insets.bottom}
            />
          ),
        }))}
        chrome={
          <View style={styles.chrome}>
            <GlassIconButton
              icon="close"
              label={t({ id: 'proposal.premium.close', message: 'Close' })}
              onPress={props.onVersion}
              testID="trailer-close"
            />
            <CritterSticker kind={info.kind} name={info.name} size={32} />
            <View style={styles.grow}>
              <Text variant="rowTextStrong">
                {t({ id: 'proposal.trailer.presents', message: `${info.name} presents` })}
              </Text>
              <Text variant="captionMuted" tone="muted" numberOfLines={1}>
                {props.line}
              </Text>
            </View>
          </View>
        }
        bottom={
          <View style={[styles.foot, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.floats} pointerEvents="none">
              {floats.map((reaction) => (
                <Animated.View
                  key={reaction.id}
                  {...(reduced ? {} : { entering: riseIn(false), exiting: FadeOut })}
                >
                  <GlassPill label={`${reaction.author} · ${reaction.text}`} kind="clear" />
                </Animated.View>
              ))}
            </View>
            {props.quick === null ? null : (
              <View style={styles.quick}>
                {props.quick.map((reply) => (
                  <Button
                    alignSelf="auto"
                    key={reply.kind}
                    variant="floating"
                    size="small"
                    label={reply.label}
                    onPress={() => props.onReact(reply.kind)}
                    testID={`trailer-react-${reply.kind}`}
                  />
                ))}
              </View>
            )}
            <View style={styles.actions}>
              <View style={styles.grow}>
                <Button
                  label={t({ id: 'proposal.trailer.in', message: 'I’m in' })}
                  onPress={props.onIn}
                  testID="trailer-in"
                />
              </View>
              <Button
                variant="secondary"
                label={t({ id: 'proposal.trailer.maybe', message: 'Maybe' })}
                onPress={props.onVersion}
                testID="trailer-maybe"
              />
              <GlassIconButton
                icon="heart"
                label={t({ id: 'proposal.trailer.react', message: 'Quick reply' })}
                onPress={props.onToggleQuick}
                testID="trailer-quick"
              />
            </View>
            <Text variant="caption" tone="muted" align="center">
              {t({ id: 'proposal.trailer.hint', message: 'Tap for the next one · hold to pause' })}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  chrome: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  grow: { flex: 1 },
  foot: { paddingHorizontal: 20, gap: 10 },
  floats: { alignItems: 'flex-end', gap: 6 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
