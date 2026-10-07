/**
 * The small word pill of the driver screens (6c-2, 6d-1): orange outline for what a driver has not
 * said, green fill for what he has, and a quiet fill for a count.
 */
import { View } from 'react-native';

import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export type SaidTone = 'unsaid' | 'said' | 'quiet' | 'plain';

/** The pill's drawn height: a tappable pill passes it to its press wrapper as `minHeight`. */
export const SAID_PILL_HEIGHT = 24;

const useStyles = makeStyles((t) => ({
  pill: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: SAID_PILL_HEIGHT,
    borderRadius: t.radius.sm,
    borderWidth: 2,
    paddingHorizontal: t.space['8'],
  },
}));

export function SaidPill({
  tone,
  children,
}: {
  readonly tone: SaidTone;
  readonly children: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const colours = {
    unsaid: { border: theme.color.orange, fill: undefined, text: theme.color.orange },
    said: {
      border: theme.color.green.base,
      fill: theme.color.green.base,
      text: theme.semantic.text.onAccent,
    },
    quiet: {
      border: theme.semantic.bg.control,
      fill: theme.semantic.bg.control,
      text: theme.semantic.text.primary,
    },
    plain: {
      border: theme.semantic.border.control,
      fill: undefined,
      text: theme.semantic.text.secondary,
    },
  }[tone];
  return (
    <View
      style={[
        styles.pill,
        { borderColor: colours.border },
        colours.fill === undefined ? null : { backgroundColor: colours.fill },
      ]}
    >
      <Text variant="label" color={colours.text} keepOneLine>
        {children}
      </Text>
    </View>
  );
}
