/**
 * The slim header a place page collapses into as it scrolls (7e-2): back, the name and ♡ on the
 * page's own background, fading in as the photo leaves; reduced motion swaps it without the fade.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { IconButton } from '@/ui/buttons/IconButton';
import { StraightArrow } from '@/ui/icons/StraightArrow';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const FADE_PT = 48;

const useStyles = makeStyles((t) => ({
  bar: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['8'],
    paddingHorizontal: t.space['12'],
    paddingBottom: t.space['8'],
    backgroundColor: t.semantic.bg.base,
    borderBottomWidth: 1,
    borderBottomColor: t.color.divider,
  },
  title: { flex: 1, minWidth: 0 },
}));

export interface CollapsingHeaderProps {
  readonly scrollY: SharedValue<number>;
  /** The scroll offset where the photo has gone. */
  readonly threshold: number;
  readonly title: string;
  readonly onBack: () => void;
  readonly saveLabel: string;
  readonly heart: ReactNode;
  readonly onToggleSave: () => void;
}

export function CollapsingHeader(props: CollapsingHeaderProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useLingui();
  const reduced = useReducedImpactMotion();
  const { scrollY, threshold } = props;
  const shown = useAnimatedStyle(() => {
    const opacity = reduced
      ? scrollY.value >= threshold
        ? 1
        : 0
      : interpolate(scrollY.value, [threshold - FADE_PT, threshold], [0, 1], 'clamp');
    return { opacity, pointerEvents: opacity > 0.5 ? 'auto' : 'none' };
  });
  return (
    <Animated.View
      style={[styles.bar, { paddingTop: insets.top + theme.space['4'] }, shown]}
      testID="place-detail-header"
    >
      <IconButton
        label={t({ id: 'explore.detail.back', message: 'Back' })}
        glyph={<StraightArrow direction="back" color={theme.semantic.text.primary} />}
        onPress={props.onBack}
        testID="place-detail-header-back"
      />
      <View style={styles.title}>
        <Text variant="title">{upper(props.title, i18n.locale)}</Text>
      </View>
      <IconButton
        label={props.saveLabel}
        glyph={props.heart}
        onPress={props.onToggleSave}
        testID="place-detail-header-save"
      />
    </Animated.View>
  );
}
