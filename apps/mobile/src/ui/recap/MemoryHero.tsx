import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles } from '../theme';

export interface MemoryHeroProps {
  readonly photo: ReactNode;
  /** Spoken description of the photo ("The six of you on Batur, 06:02"). */
  readonly photoLabel: string;
  /** "One year ago today". */
  readonly eyebrow: string;
  readonly title: string;
  readonly body?: string;
  /** Crew reaction chips. */
  readonly reactions?: ReactNode;
  /** Close button in the top corner. */
  readonly close?: ReactNode;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  photo: {
    height: th.space['32'] * 11,
    borderBottomStartRadius: th.radius.heroBottom,
    borderBottomEndRadius: th.radius.heroBottom,
    overflow: 'hidden',
  },
  top: { position: 'absolute', top: th.space['16'], start: th.space['16'], end: th.space['16'] },
  body: { padding: th.space['20'], gap: th.space['10'] },
}));

/** Anniversary memory: full-bleed photo, the line about it and the crew's reactions. */
export function MemoryHero({
  photo,
  photoLabel,
  eyebrow,
  title,
  body,
  reactions,
  close,
  testID,
}: MemoryHeroProps) {
  const styles = useStyles();
  return (
    <View testID={testID}>
      <View
        style={styles.photo}
        accessible
        accessibilityRole="image"
        accessibilityLabel={photoLabel}
      >
        {photo}
      </View>
      <Row style={styles.top} justify="space-between" align="center">
        <Text variant="eyebrow">{eyebrow}</Text>
        {close}
      </Row>
      <Stack style={styles.body}>
        <Text variant="h1" accessibilityRole="header">
          {title}
        </Text>
        {body ? <Text variant="bodyLg">{body}</Text> : null}
        {reactions}
      </Stack>
    </View>
  );
}
