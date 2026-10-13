/**
 * One trailer slide in the premium look: the page's ground with the guide's sticker large and
 * faded behind, the stop's day and time, the headline stamping in as one block and the guide's
 * line. Reduce Motion shows it at once.
 */
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { guideSticker, type GuideStickerId } from '@/ui/premium/stickers/guides';
import { CritterSticker, Text, usePremiumReducedMotion, usePremiumTheme } from '@/ui/premium';
import { popIn } from '../entrances';

export function PremiumTrailerSlide(props: {
  readonly guide: GuideStickerId;
  readonly eyebrow: string | null;
  readonly headline: string;
  readonly body: string;
  /** Room left at the foot for the replies and buttons. */
  readonly bottom: number;
}) {
  const theme = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const info = guideSticker(props.guide);
  return (
    <View
      style={[styles.slide, { paddingBottom: props.bottom, backgroundColor: theme.color.ground }]}
    >
      <View style={styles.art} importantForAccessibility="no-hide-descendants">
        <CritterSticker kind={info.kind} name={info.name} size={200} />
      </View>
      {props.eyebrow === null ? null : (
        <Text variant="label" tone="muted">
          {props.eyebrow}
        </Text>
      )}
      <Animated.View key={props.headline} entering={popIn(reduced, 'lively')}>
        <Text variant="display" numberOfLines={4} accessibilityRole="header">
          {props.headline}
        </Text>
      </Animated.View>
      {props.body === '' ? null : (
        <Text variant="body" tone="inkSecondary">
          {props.body}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 24,
  },
  art: { position: 'absolute', top: '20%', alignSelf: 'center', opacity: 0.25 },
});
