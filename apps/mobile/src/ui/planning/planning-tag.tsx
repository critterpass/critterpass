/**
 * A short status word on a planning row (7a-3 BOOKED, CLASH, RAIN, VOTE, TOO FAR; 7c-3 SPLIT;
 * 7b-1 RAIN LIKELY 13–15): filled in the colour that names the state, or quiet on the row.
 */
import { View } from 'react-native';

import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface PlanningTagProps {
  readonly label: string;
  /** The fill; absent draws the quiet tag (VOTE). */
  readonly color?: string | undefined;
  readonly testID?: string | undefined;
}

const useStyles = makeStyles((t) => ({
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['4'],
    borderRadius: t.radius.lg,
  },
  quiet: { backgroundColor: t.semantic.bg.control },
}));

export function PlanningTag({ label, color, testID }: PlanningTagProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View
      style={[styles.tag, color === undefined ? styles.quiet : { backgroundColor: color }]}
      testID={testID}
    >
      <Text
        variant="label"
        color={color === undefined ? theme.semantic.action.primary : theme.semantic.text.onAccent}
      >
        {label}
      </Text>
    </View>
  );
}
