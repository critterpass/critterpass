import { View } from 'react-native';

import type { DoodleName } from '../icons/generated';
import { Icon } from '../icons/Icon';
import { Text } from '../text/Text';
import type { Theme } from '../theme';
import { makeStyles, useTheme } from '../theme';

/** What the tag says about its row; each tone is a fill and the ink that reads on it. */
export type TagTone =
  | 'success'
  | 'urgent'
  | 'warning'
  | 'info'
  | 'primary'
  | 'boost'
  | 'passPlus'
  /** Quiet on the row, in the action colour (VOTE). */
  | 'quiet'
  /** Quiet on the row, in secondary ink (ENDED, FREE). */
  | 'neutral';

export interface TagProps {
  readonly label: string;
  /** @default 'neutral' */
  readonly tone?: TagTone | undefined;
  /** A palette fill that replaces the tone's (a day's colour, a category colour). */
  readonly color?: string | undefined;
  /** `sm` sits inside dense rows and beside titles; `md` ends a row. @default 'md' */
  readonly size?: 'sm' | 'md' | undefined;
  readonly icon?: DoodleName | undefined;
  readonly testID?: string | undefined;
}

const ICON_SIZE = 12;

function inkFor(theme: Theme, tone: TagTone): { readonly bg: string; readonly fg: string } {
  const onAccent = theme.semantic.text.onAccent;
  switch (tone) {
    case 'success':
      return { bg: theme.semantic.state.success, fg: onAccent };
    case 'urgent':
      return { bg: theme.semantic.state.urgent, fg: onAccent };
    case 'warning':
      return { bg: theme.semantic.state.warning, fg: onAccent };
    case 'info':
      return { bg: theme.semantic.state.info, fg: onAccent };
    case 'primary':
      return { bg: theme.semantic.action.primary, fg: onAccent };
    case 'boost':
      return { bg: theme.semantic.brand.boost, fg: onAccent };
    case 'passPlus':
      return { bg: theme.semantic.brand.passplus, fg: onAccent };
    case 'quiet':
      return { bg: theme.semantic.bg.control, fg: theme.semantic.action.primary };
    case 'neutral':
      return { bg: theme.semantic.bg.control, fg: theme.semantic.text.secondary };
  }
}

const useStyles = makeStyles((t) => ({
  tag: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: t.space['4'],
    borderRadius: t.radius.sm,
  },
  sm: { paddingHorizontal: t.space['8'], paddingVertical: t.space['2'] },
  md: { paddingHorizontal: t.space['10'], paddingVertical: t.space['4'] },
}));

/**
 * The one status tag: a short word in label type on a rounded fill (BOOKED, CLASH, VOTE, PASS+).
 * Always a word, never colour alone.
 */
export function Tag({ label, tone = 'neutral', color, size = 'md', icon, testID }: TagProps) {
  const styles = useStyles();
  const theme = useTheme();
  const ink = inkFor(theme, tone);
  const bg = color ?? ink.bg;
  const fg = color === undefined ? ink.fg : theme.semantic.text.onAccent;
  return (
    <View testID={testID} style={[styles.tag, styles[size], { backgroundColor: bg }]}>
      {icon === undefined ? null : <Icon name={icon} size={ICON_SIZE} color={fg} decorative />}
      <Text variant="label" color={fg}>
        {label}
      </Text>
    </View>
  );
}
