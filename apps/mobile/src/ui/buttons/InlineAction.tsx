import { View } from 'react-native';

import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import type { Theme } from '../theme';
import { makeStyles, sizeToken, useTheme } from '../theme';

export type InlineActionKind = 'choice' | 'approve' | 'nudge' | 'ghost';

export interface InlineActionProps {
  readonly label: string;
  readonly onPress: () => void;
  /** @default 'choice' */
  readonly kind?: InlineActionKind;
  /** A chosen `choice` (e.g. the vote you cast) shows filled. */
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly testID?: string;
}

function colours(theme: Theme, kind: InlineActionKind, selected: boolean) {
  if (kind === 'approve')
    return { bg: theme.semantic.state.success, fg: theme.semantic.text.onAccent };
  if (kind === 'nudge')
    return { bg: theme.semantic.state.warning, fg: theme.semantic.text.onAccent };
  if (kind === 'ghost') return { bg: undefined, fg: theme.semantic.text.secondary };
  return selected
    ? { bg: theme.semantic.action.primary, fg: theme.semantic.text.onAccent }
    : { bg: theme.semantic.bg.control, fg: theme.semantic.text.primary };
}

const useStyles = makeStyles((t) => ({
  target: { justifyContent: 'center', alignItems: 'flex-start' },
  pill: {
    minHeight: sizeToken(t.size.chip, 'height'),
    borderRadius: sizeToken(t.size.chip, 'height') / 2,
    paddingHorizontal: t.space['14'],
    justifyContent: 'center',
  },
  ghost: { borderWidth: 1.5, borderColor: t.semantic.border.control },
}));

/** Compact answer pills inside cards: choice, approve, nudge, ghost (32 pt look, 44 pt target). */
export function InlineAction({
  label,
  onPress,
  kind = 'choice',
  selected = false,
  disabled = false,
  testID,
}: InlineActionProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { bg, fg } = colours(theme, kind, selected);
  return (
    <PressScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      widthClass="narrow"
      accessibilityLabel={label}
      accessibilityState={kind === 'choice' ? { selected } : undefined}
      style={styles.target}
    >
      <View style={[styles.pill, bg ? { backgroundColor: bg } : styles.ghost]}>
        <Text variant="buttonSm" color={fg}>
          {label}
        </Text>
      </View>
    </PressScale>
  );
}
