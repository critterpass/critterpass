import type { ReactNode } from 'react';
import { View } from 'react-native';

import { SecondaryText } from '../cards/SecondaryText';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Tag } from '../plan/ActionPill';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export type WatchTone = 'warning' | 'urgent' | 'info' | 'success';

export interface WatchRowProps {
  readonly icon: ReactNode;
  /** "Rough seas Friday". */
  readonly title: string;
  readonly detail?: string;
  /** Status word, never colour-only ("Plan B", "Watching", "Go", "Set"). */
  readonly status: string;
  readonly tone: WatchTone;
  readonly onPress?: () => void;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  row: { gap: th.space['12'], alignItems: 'center', paddingVertical: th.space['10'] },
  icon: {
    width: th.space['32'] + th.space['8'],
    height: th.space['32'] + th.space['8'],
    borderRadius: th.space['20'],
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

/** One thing the guide is watching (weather, roads, crowds) with its status tag. */
export function WatchRow({ icon, title, detail, status, tone, onPress, testID }: WatchRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const color = theme.semantic.state[tone];
  const label = [status, title, detail].filter(Boolean).join(', ');
  const body = (
    <Row style={styles.row}>
      <View style={[styles.icon, { backgroundColor: color }]}>{icon}</View>
      <Stack gap="2" flex={1}>
        <Text variant="title">{title}</Text>
        {detail ? <SecondaryText>{detail}</SecondaryText> : null}
      </Stack>
      <Tag label={status} color={color} />
    </Row>
  );
  return onPress ? (
    <PressScale testID={testID} accessibilityLabel={label} onPress={onPress} widthClass="wide">
      {body}
    </PressScale>
  ) : (
    <View testID={testID} accessible accessibilityRole="text" accessibilityLabel={label}>
      {body}
    </View>
  );
}
