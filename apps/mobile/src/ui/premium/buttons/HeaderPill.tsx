/**
 * A header's verb as the ink pill (journeys 03, 04, 07, 09: "Save", "Post", "Add", "Done"): 44 high,
 * radius 22, the ink gradient with its top highlight and a white 15/600 word; disabled, a grey fill
 * and the placeholder word. Busy, a spinner stands in for the word and the pill keeps its width.
 * Header actions are never bare words.
 */
import { StyleSheet, View } from 'react-native';

import { Spinner } from '../feedback/Spinner';
import { PressableScale } from '../motion/PressableScale';
import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export interface HeaderPillProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly testID?: string;
}

/** The pill's top highlight (inset 0 1 0 white at .18). */
// eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS shadow, never rendered copy.
const TOP_HIGHLIGHT = 'inset 0px 1px 0px rgba(255,255,255,0.18)';

export function HeaderPill({
  label,
  onPress,
  disabled = false,
  busy = false,
  testID,
}: HeaderPillProps) {
  const t = usePremiumTheme();
  const c = t.color;
  const off = disabled && !busy;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled }}
    >
      <View
        style={[
          styles.pill,
          {
            height: t.size.glassNav,
            borderRadius: t.size.glassNav / 2,
            paddingHorizontal: t.space.gap16 + 1,
          },
          off
            ? { backgroundColor: c.controlDisabled }
            : {
                // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS gradient, never rendered copy.
                experimental_backgroundImage: `linear-gradient(180deg, ${c.inkFillTop}, ${c.inkFillBottom})`,
                backgroundColor: c.inkFillBottom,
                boxShadow: TOP_HIGHLIGHT,
              },
        ]}
      >
        <Text
          variant="glassTitle"
          color={off ? c.placeholder : c.onInk}
          numberOfLines={1}
          style={busy ? styles.hidden : null}
        >
          {label}
        </Text>
        {busy ? (
          <View style={styles.spinner}>
            <Spinner surface="ink" />
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: { alignItems: 'center', justifyContent: 'center' },
  hidden: { opacity: 0 },
  spinner: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
