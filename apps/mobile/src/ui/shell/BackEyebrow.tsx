import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { I18nManager, Pressable, View } from 'react-native';

import { useSurfaceTone } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { degrees, makeStyles, MIN_TOUCH_TARGET, useTheme } from '../theme';

const ARROW_WIDTH = 11;
const ARROW_STROKE = 2;
const ARROW_HEAD = 6;

const useStyles = makeStyles((t) => ({
  button: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['6'],
    alignSelf: 'flex-start',
  },
  arrow: { width: ARROW_WIDTH, height: ARROW_HEAD * 1.5, justifyContent: 'center' },
  shaft: { height: ARROW_STROKE, borderRadius: ARROW_STROKE / 2 },
  head: {
    position: 'absolute',
    start: ARROW_STROKE / 2,
    width: ARROW_HEAD,
    height: ARROW_HEAD,
    borderStartWidth: ARROW_STROKE,
    borderBottomWidth: ARROW_STROKE,
    transform: [{ rotate: degrees(45) }],
  },
}));

/** A drawn back arrow (not a text glyph) that points the reading direction's way back. */
function BackArrow({ color }: { readonly color: string }) {
  const styles = useStyles();
  return (
    <View
      style={[styles.arrow, { transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.shaft, { backgroundColor: color }]} />
      <View style={[styles.head, { borderColor: color }]} />
    </View>
  );
}

export interface BackEyebrowProps {
  /** The parent section, e.g. "Profile" (uppercased at render). */
  readonly label: string;
  /** Defaults to going back one screen. */
  readonly onPress?: (() => void) | undefined;
  /**
   * Ink for the arrow and label. Defaults to the surface's: secondary text on dark screens, the
   * on-accent ink on a colour surface (a showdown half, a hero), paper ink on paper.
   */
  readonly color?: string | undefined;
  readonly testID?: string | undefined;
}

/** "← SECTION" back affordance of pushed screens (docs/design-system.md §2.1). */
export function BackEyebrow({ label, onPress, color, testID = 'back-eyebrow' }: BackEyebrowProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const tone = useSurfaceTone();
  const ink =
    color ??
    (tone === 'accent'
      ? theme.semantic.text.onAccent
      : tone === 'paper'
        ? theme.color.paper.muted
        : theme.semantic.text.secondary);
  const section = label;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={t({ id: 'common.shell.backTo', message: `Back to ${section}` })}
      onPress={onPress ?? (() => router.back())}
      style={styles.button}
    >
      <BackArrow color={ink} />
      <Text variant="eyebrow" color={ink}>
        {label}
      </Text>
    </Pressable>
  );
}
