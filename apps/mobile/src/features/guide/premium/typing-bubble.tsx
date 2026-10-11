/** The guide is thinking: its disc in the think pose beside three dots in its yellow bubble. */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { makePremiumStyles } from '@/ui/premium';

import { GuideDisc } from './guide-bubbles';

const useStyles = makePremiumStyles((th) => ({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: th.space.gap8 },
  bubble: {
    flexDirection: 'row',
    gap: 5,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: th.radius.banner,
    borderBottomLeftRadius: 6,
    backgroundColor: th.color.banner.guide.bg,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: th.color.guideName },
}));

export function TypingBubble({
  slug,
  guideName,
}: {
  readonly slug: string;
  readonly guideName: string;
}) {
  const styles = useStyles();
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={t({ id: 'guide.premium.thinking', message: `${guideName} is thinking` })}
      testID="guide-thinking"
    >
      <GuideDisc slug={slug} name={guideName} size={28} pose="think" />
      <View style={styles.bubble}>
        {[0.35, 0.6, 0.85].map((opacity) => (
          <View key={opacity} style={[styles.dot, { opacity }]} />
        ))}
      </View>
    </View>
  );
}
