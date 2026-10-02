/**
 * MATCH: the stamp that lands (with the thud) when enough of the crew said yes to a card, over a
 * line saying where the place goes next.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { patterns } from '@/motion';
import { Text } from '@/ui/text/Text';
import { degrees, makeStyles, useTheme } from '@/ui/theme';

export interface MatchStampProps {
  readonly placeName: string;
  /** The day the plan suggests for it; null when no slot was free. */
  readonly dayNo: number | null;
  readonly onDone: () => void;
}

const useStyles = makeStyles((t) => ({
  veil: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space['16'],
    padding: t.space['24'],
    backgroundColor: t.semantic.bg.base,
    opacity: 0.94,
  },
  stamp: {
    borderWidth: t.space['4'],
    borderColor: t.semantic.state.success,
    borderRadius: t.radius.md,
    paddingHorizontal: t.space['20'],
    paddingVertical: t.space['8'],
    transform: [{ rotate: degrees(-8) }],
  },
}));

export function MatchStamp({ placeName, dayNo, onDone }: MatchStampProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const land = patterns.useStamp({ active: true });
  return (
    <Pressable
      style={styles.veil}
      accessibilityRole="button"
      accessibilityLabel={t({ id: 'explore.swipe.matchDismiss', message: 'Keep swiping' })}
      onPress={onDone}
      testID="explore-swipe-match"
    >
      <Animated.View style={land}>
        <View style={styles.stamp}>
          <Text variant="displayXl" color={theme.semantic.state.success}>
            {upper(t({ id: 'explore.swipe.match', message: 'Match' }), i18n.locale)}
          </Text>
        </View>
      </Animated.View>
      <Text variant="h3" style={{ textAlign: 'center' }}>
        {dayNo === null
          ? t({
              id: 'explore.swipe.matchUnslotted',
              message: `${placeName} is a match. The plan has no free slot for it yet.`,
            })
          : t({
              id: 'explore.swipe.matchSuggested',
              message: `${placeName} is suggested for Day ${dayNo}. The organiser okays it.`,
            })}
      </Text>
      <Text variant="bodySm" color={theme.semantic.text.secondary}>
        {t({ id: 'explore.swipe.matchTap', message: 'Tap to keep swiping' })}
      </Text>
    </Pressable>
  );
}
