import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { DoodleName } from '../icons/generated';
import { Icon } from '../icons/Icon';
import { useSurfaceTone } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { makeStyles, sizeToken, useTheme } from '../theme';

export interface InfoPillProps {
  /** "Plan 80%", "Apr 2–9", a countdown string or node. */
  readonly children: ReactNode;
  readonly icon?: DoodleName;
  /** `solid` is ink on colour heroes (3b-2 countdown), `outline` an ink-ringed variant. @default 'solid' */
  readonly variant?: 'solid' | 'outline';
  /** Read instead of the visible text (spelled-out countdown). */
  readonly accessibilityLabel?: string;
  /** Text too long for the row ends in an ellipsis on one line instead of wrapping (free text). */
  readonly oneLine?: boolean;
  /**
   * A short fact the design sets on one line that is never cut: the pill widens to the text instead
   * of wrapping it (a glyph from a fallback font, ₫ or ≈, can draw wider than it was measured).
   */
  readonly nowrap?: boolean;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  pill: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: t.space['6'],
    alignItems: 'center',
    minHeight: sizeToken(t.size.chip, 'height'),
    borderRadius: t.radius.sm,
    paddingHorizontal: t.space['10'],
    borderWidth: 2,
  },
}));

/** A non-interactive fact pill: countdown, plan progress, dates. */
export function InfoPill({
  children,
  icon,
  variant = 'solid',
  accessibilityLabel,
  oneLine = false,
  nowrap = false,
  testID,
}: InfoPillProps) {
  const styles = useStyles();
  const theme = useTheme();
  const tone = useSurfaceTone();
  const ink = tone === 'dark' ? theme.semantic.bg.raised : theme.color.ink[850];
  const solid = variant === 'solid';
  const fg = solid
    ? tone === 'dark'
      ? theme.semantic.text.primary
      : theme.color.paper.base
    : tone === 'dark'
      ? theme.semantic.text.primary
      : theme.color.ink[850];
  return (
    <View
      testID={testID}
      style={[
        styles.pill,
        { borderColor: ink },
        solid ? { backgroundColor: ink } : null,
        oneLine ? { maxWidth: '100%' } : null,
      ]}
      accessible
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
    >
      {icon ? <Icon name={icon} size={14} color={fg} decorative /> : null}
      {typeof children === 'string' ? (
        <Text
          variant="label"
          color={fg}
          {...(oneLine ? { numberOfLines: 1, style: { flexShrink: 1 } } : {})}
          keepOneLine={nowrap && !oneLine}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}
