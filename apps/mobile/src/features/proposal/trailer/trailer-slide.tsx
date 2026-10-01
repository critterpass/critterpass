/**
 * One trailer slide (3f-2): the guide's art card as the backdrop (licensed destination photos are
 * not in yet), the stop's day and time, the headline stamping in as one block (one text, so its
 * wrapped lines keep the display leading), and the guide's line in the voice face. Reduced motion
 * shows it at once.
 */
import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import type { GuideStickerId as GuideId } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  slide: { flex: 1, justifyContent: 'flex-end', padding: th.space['20'], paddingBottom: 190 },
  art: { position: 'absolute', top: '22%', alignSelf: 'center', opacity: 0.35 },
  body: { marginTop: th.space['8'] },
}));

export interface TrailerSlideProps {
  readonly guide: GuideId;
  readonly eyebrow: string | null;
  readonly headline: string;
  readonly body: string;
}

export function TrailerSlide({ guide, eyebrow, headline, body }: TrailerSlideProps) {
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const info = GUIDE_STICKERS[guide];
  return (
    <View style={[styles.slide, { backgroundColor: theme.color.rust.darkened }]}>
      <View style={styles.art} importantForAccessibility="no-hide-descendants">
        <Sticker kind={info.kind} name={info.name} size={180} />
      </View>
      {eyebrow === null ? null : (
        <Text variant="eyebrow" color={theme.color.orange}>
          {eyebrow}
        </Text>
      )}
      <Animated.View key={headline} {...(reduced ? {} : { entering: ZoomIn })}>
        <Text variant="displayXl" autoFit={false} numberOfLines={4} accessibilityRole="header">
          {headline.toUpperCase()}
        </Text>
      </Animated.View>
      {body === '' ? null : (
        <Text variant="voice" color={theme.semantic.action.primary} style={styles.body}>
          {body}
        </Text>
      )}
    </View>
  );
}
