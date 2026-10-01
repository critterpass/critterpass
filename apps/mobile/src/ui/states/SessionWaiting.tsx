import { View } from 'react-native';

import { useNoBackByDesign } from '../qa/back-affordance';
import { Scaffold } from '../surface/Scaffold';
import { makeStyles } from '../theme';
import { Skeleton } from './Skeleton';

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, paddingTop: t.space['24'], gap: t.space['16'] },
}));

/**
 * What a screen that reads the local database shows while the session is still starting (a cold
 * start can restore such a screen before the database is open): the loading skeleton on the app's
 * ink, so the wait reads as loading and never as an empty screen.
 */
export function SessionWaiting({ testID }: { readonly testID?: string }) {
  // A placeholder for the screen that follows; that screen carries the way back.
  useNoBackByDesign();
  const styles = useStyles();
  return (
    <Scaffold variant="dark" {...(testID ? { testID } : {})}>
      <View style={styles.body}>
        <Skeleton preset="card" />
        <Skeleton preset="list" repeat={3} />
      </View>
    </Scaffold>
  );
}
