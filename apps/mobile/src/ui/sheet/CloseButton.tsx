import { useLingui } from '@lingui/react/macro';
import { Pressable, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { useBackAffordance } from '../qa/back-affordance';
import { degrees, makeStyles, MIN_TOUCH_TARGET, sizeToken } from '../theme';

/** 40 pt disc, the header-pill height (docs/design-system.md §2.1 `CloseButton`). */
const SIZE = sizeToken(tokens.size.headerPill, 'height');
const STROKE = 2.5;
const GLYPH = 14;
const HIT_SLOP = Math.max(0, (MIN_TOUCH_TARGET - SIZE) / 2);

const useStyles = makeStyles((t) => ({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: t.semantic.bg.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onPaper: { backgroundColor: t.color.paper.ink },
  stroke: {
    position: 'absolute',
    width: GLYPH,
    height: STROKE,
    borderRadius: STROKE / 2,
    backgroundColor: t.semantic.text.primary,
  },
  forward: { transform: [{ rotate: degrees(45) }] },
  backward: { transform: [{ rotate: degrees(-45) }] },
}));

export interface CloseButtonProps {
  readonly onPress: () => void;
  /** Paper sheets use an ink disc so the ✕ keeps its contrast. */
  readonly onPaper?: boolean | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
  readonly testID?: string | undefined;
}

/** The mandatory ✕ of every sheet and rise: a 40 pt disc with a 44/48 hit target. */
export function CloseButton({
  onPress,
  onPaper = false,
  style,
  testID = 'sheet-close',
}: CloseButtonProps) {
  const { t } = useLingui();
  const styles = useStyles();
  useBackAffordance();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={t({ id: 'common.sheet.close', message: 'Close' })}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={[styles.button, onPaper ? styles.onPaper : null, style]}
    >
      <View style={[styles.stroke, styles.forward]} />
      <View style={[styles.stroke, styles.backward]} />
    </Pressable>
  );
}
