/**
 * What a pushed screen shows while the thing it is about is still being read: the loading skeleton
 * under the screen's own back eyebrow, so a slow or cold open can always be left.
 *
 * Use it for the "still loading" branch of any pushed screen, with the same `backLabel` and
 * `fallback` the loaded screen gives its `BackEyebrow`. For "not there" use `ScreenMissing`; only
 * the wait for the session itself uses `SessionWaiting` (no back by design).
 */
import type { Href } from 'expo-router';
import { View } from 'react-native';

import { BackEyebrow } from '../shell/BackEyebrow';
import { Scaffold } from '../surface/Scaffold';
import { makeStyles } from '../theme';
import { Skeleton } from './Skeleton';

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, gap: t.space['16'] },
}));

export interface ScreenLoadingProps {
  /** The parent section the back eyebrow names, as the loaded screen writes it ("TRIP"). */
  readonly backLabel: string;
  /** Where back lands when the screen was opened cold. @default Home */
  readonly fallback?: Href | undefined;
  /** What is loading, for screen readers ("Loading the booking"). */
  readonly label?: string | undefined;
  readonly testID?: string | undefined;
}

export function ScreenLoading({
  backLabel,
  fallback,
  label,
  testID = 'screen-loading',
}: ScreenLoadingProps) {
  const styles = useStyles();
  return (
    <Scaffold variant="dark" testID={testID}>
      <View style={styles.body}>
        <BackEyebrow label={backLabel} fallback={fallback} testID={`${testID}-back`} />
        <Skeleton preset="card" {...(label === undefined ? {} : { label })} />
        <Skeleton preset="list" repeat={3} />
      </View>
    </Scaffold>
  );
}
