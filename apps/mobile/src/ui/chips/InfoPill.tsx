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
      style={[styles.pill, { borderColor: ink }, solid ? { backgroundColor: ink } : null]}
      accessible
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
    >
      {icon ? <Icon name={icon} size={14} color={fg} decorative /> : null}
      {typeof children === 'string' ? (
        <Text variant="label" color={fg}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}
