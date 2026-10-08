/**
 * Home's dashed row: a quiet way out to somewhere Home itself doesn't show (3b-1's SOMEWHERE ELSE,
 * the Explore entry). A round mark, a title and one line of what is behind it.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

const MARK = 36;

const useStyles = makeStyles((t) => ({
  row: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: t.radius.cardBig,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: t.color.divider,
    padding: t.space['16'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['16'],
  },
  mark: {
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    backgroundColor: t.semantic.bg.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: t.space['2'] },
}));

export interface DashedRowProps {
  readonly testID: string;
  /** Already cased for display. */
  readonly title: string;
  readonly body: string;
  /** What sits in the round mark (a plus, an icon). */
  readonly mark: ReactNode;
  readonly onPress: () => void;
}

export function DashedRow({ testID, title, body, mark, onPress }: DashedRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <PressScale
      testID={testID}
      widthClass="wide"
      accessibilityLabel={`${title}. ${body}`}
      onPress={onPress}
      style={styles.row}
    >
      <View style={styles.mark}>{mark}</View>
      <View style={styles.copy}>
        <Text variant="title">{title}</Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {body}
        </Text>
      </View>
    </PressScale>
  );
}
