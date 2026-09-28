import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { useStamp } from '@/motion/patterns/stamp';
import { upper } from '@cp/i18n';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  chip: {
    borderWidth: 2,
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['10'],
    paddingVertical: th.space['4'],
  },
  slot: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['10'],
    paddingVertical: th.space['4'],
  },
}));

/** An answer stamped onto ON YOUR PASS: thuds in (2.2 → .94 → 1.04 → 1) when it first appears. */
export function TagStamp({
  label,
  index,
  stamp,
}: {
  readonly label: string;
  readonly index: number;
  /** Only answers given on this screen thud in; restored ones are already on the page. */
  readonly stamp: boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const inks = [theme.color.pink, theme.color.green.base, theme.color.blue, theme.color.orange];
  const ink = inks[index % inks.length] ?? theme.color.pink;
  const style = useStamp({ active: stamp });
  return (
    <Animated.View style={stamp ? style : null}>
      <View
        style={[
          styles.chip,
          { borderColor: ink, transform: [{ rotate: `${index % 2 === 0 ? -3 : 2}deg` }] },
        ]}
      >
        <Text variant="label" color={ink}>
          {upper(label, locale)}
        </Text>
      </View>
    </Animated.View>
  );
}

/** The dashed "?" slot where the next answer lands. */
export function TagSlot() {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View
      style={[styles.slot, { borderColor: theme.semantic.text.tertiary }]}
      accessibilityElementsHidden
    >
      <Text variant="label" color={theme.semantic.text.tertiary}>
        ?
      </Text>
    </View>
  );
}
