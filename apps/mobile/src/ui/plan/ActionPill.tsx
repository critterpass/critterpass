import type { ReactNode } from 'react';
import type { AccessibilityRole, StyleProp, ViewStyle } from 'react-native';

import { Row } from '../layout/Row';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import type { Theme } from '../theme';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '../theme';

export type ActionPillTone = 'primary' | 'secondary' | 'outline' | 'success' | 'urgent' | 'paper';

function fillOf(theme: Theme, tone: ActionPillTone): { bg: string; fg: string; border?: string } {
  switch (tone) {
    case 'primary':
      return { bg: theme.semantic.action.primary, fg: theme.semantic.text.onAccent };
    case 'success':
      return { bg: theme.semantic.state.success, fg: theme.semantic.text.onAccent };
    case 'urgent':
      return { bg: theme.semantic.state.urgent, fg: theme.semantic.text.onAccent };
    case 'paper':
      return { bg: theme.color.paper.base, fg: theme.color.paper.ink };
    case 'outline':
      return {
        bg: theme.semantic.bg.base,
        fg: theme.semantic.text.primary,
        border: theme.semantic.border.control,
      };
    case 'secondary':
      return { bg: theme.semantic.bg.control, fg: theme.semantic.text.primary };
  }
}

export interface ActionPillProps {
  readonly label: string;
  readonly onPress?: () => void;
  /** @default 'secondary' */
  readonly tone?: ActionPillTone;
  /** Leading icon or glyph. */
  readonly icon?: ReactNode;
  /** Replaces the visible label for screen readers ("Keep this change"). */
  readonly accessibilityLabel?: string;
  readonly accessibilityRole?: AccessibilityRole;
  /** Selected (buttons) or checked (checkbox, radio and switch roles). */
  readonly selected?: boolean;
  readonly disabled?: boolean;
  /** Square circle button (icon only). */
  readonly round?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  // The pill is drawn at the full touch target by its own style (a 44 pt pill or circle).
  pill: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: th.size.chip.height,
    paddingHorizontal: th.space['14'],
    justifyContent: 'center',
    alignItems: 'center',
  },
  round: { minWidth: MIN_TOUCH_TARGET, paddingHorizontal: 0, borderRadius: th.radius.xl },
}));

/**
 * The compact action used inside plan, vote, chat, trip and critter cards: a 44 pt pill (or
 * circle) with `button.sm` label, token fill per tone and selected state.
 */
export function ActionPill({
  label,
  onPress,
  tone = 'secondary',
  icon,
  accessibilityLabel,
  accessibilityRole,
  selected,
  disabled,
  round = false,
  style,
  testID,
}: ActionPillProps) {
  const styles = useStyles();
  const theme = useTheme();
  const fill = fillOf(theme, tone);
  return (
    <PressScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      widthClass="narrow"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole={accessibilityRole}
      {...(selected === undefined
        ? {}
        : {
            accessibilityState:
              accessibilityRole === 'checkbox' ||
              accessibilityRole === 'radio' ||
              accessibilityRole === 'switch'
                ? { checked: selected }
                : { selected },
          })}
      style={[
        styles.pill,
        round ? styles.round : null,
        {
          backgroundColor: fill.bg,
          borderWidth: fill.border ? theme.ring.input.idle.widthPt : 0,
          borderColor: fill.border,
        },
        disabled ? { opacity: 0.45 } : null,
        style,
      ]}
    >
      <Row gap="6" align="center">
        {icon}
        {round && icon ? null : (
          <Text variant="buttonSm" color={fill.fg}>
            {label}
          </Text>
        )}
      </Row>
    </PressScale>
  );
}

export interface TagProps {
  readonly label: string;
  /** Fill colour. @default bg.control */
  readonly color?: string;
  /** Label colour. @default text.onAccent on a colour fill, text.primary on bg.control */
  readonly textColor?: string;
}

/** A small static status tag ("Requested", "Paid ✓", "Leading"); part of its row's label. */
export function Tag({ label, color, textColor }: TagProps) {
  const theme = useTheme();
  return (
    <Row
      style={{
        backgroundColor: color ?? theme.semantic.bg.control,
        borderRadius: theme.radius.sm,
        paddingHorizontal: theme.space['8'],
        paddingVertical: theme.space['4'],
        alignSelf: 'flex-start',
      }}
    >
      <Text
        variant="label"
        color={textColor ?? (color ? theme.semantic.text.onAccent : theme.semantic.text.primary)}
      >
        {label}
      </Text>
    </Row>
  );
}
