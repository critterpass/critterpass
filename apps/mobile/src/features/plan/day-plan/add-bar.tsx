/**
 * The day plan's add bar (7b-1): "+ Add a place, or paste a link", pinned at the foot of the day
 * under a fade, where every add starts. It
 * opens search scoped to the day (a name, plain words or a link) once search is registered, and
 * the earlier add sheet until then.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { guideSticker } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';
import { PressScale } from '@/ui/press/PressScale';
import { Sticker } from '@/ui/sticker/Sticker';
import { useSurfaceBackground } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  wrap: { paddingHorizontal: t.size.gutter, paddingTop: t.space['4'] },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['12'],
    minHeight: 56,
    paddingStart: t.space['8'],
    paddingEnd: t.space['12'],
    borderRadius: 28,
    backgroundColor: t.semantic.bg.raised,
  },
  plus: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.semantic.action.primary,
  },
  label: { flex: 1, minWidth: 0 },
}));

export function AddBar({
  guide,
  onPress,
}: {
  readonly guide: GuideId;
  readonly onPress: () => void;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const sticker = guideSticker(guide);
  const page = useSurfaceBackground() ?? theme.semantic.bg.base;
  const label = t({ id: 'plan.dayPlan.add', message: 'Add a place, or paste a link' });
  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + 8, backgroundColor: page }]}>
      <PressScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID="day-plan-add"
      >
        <View style={styles.bar}>
          <View style={styles.plus}>
            <Text variant="h3" color={theme.color.paper.ink}>
              +
            </Text>
          </View>
          <Text
            variant="body"
            color={theme.semantic.text.secondary}
            style={styles.label}
            numberOfLines={1}
          >
            {label}
          </Text>
          <Sticker kind={sticker.kind} name={sticker.name} size={28} />
        </View>
      </PressScale>
    </View>
  );
}
