/**
 * What a driver screen shows when its read did not come back: the reason (no signal, or the
 * request failed), a way to try again and the way back. Never the skeleton, and never the
 * "nobody here" state, which would read as a real answer.
 */
import { useLingui } from '@lingui/react/macro';
import type { Href } from 'expo-router';
import { View } from 'react-native';

import { useActiveGuide } from '@/lib/navigation/active-guide';
import { guideSticker } from '@/ui/avatar/guides';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { EmptyState } from '@/ui/states/EmptyState';
import { Scaffold } from '@/ui/surface/Scaffold';
import { makeStyles } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  header: { paddingHorizontal: t.size.gutter, paddingTop: t.space['8'] },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center' },
}));

export interface LoadFailedProps {
  /** No signal, as opposed to a request the server refused or dropped. */
  readonly offline: boolean;
  readonly onRetry: () => void;
  readonly testID: string;
}

/** The state alone, for a screen that keeps its own header above it. */
export function LoadFailed({ offline, onRetry, testID }: LoadFailedProps) {
  const { t } = useLingui();
  const { guideId } = useActiveGuide();
  return (
    <EmptyState
      guide={guideId}
      guideName={guideSticker(guideId).name}
      title={
        offline
          ? t({ id: 'drivers.load.offlineTitle', message: 'No signal' })
          : t({ id: 'drivers.load.failedTitle', message: 'That didn’t load' })
      }
      line={
        offline
          ? t({
              id: 'drivers.load.offlineLine',
              message: 'This needs a connection. Try again when you’re back online.',
            })
          : t({ id: 'drivers.load.failedLine', message: 'Something went wrong on the way.' })
      }
      action={{
        label: t({ id: 'drivers.load.retry', message: 'Try again' }),
        onPress: onRetry,
      }}
      testID={testID}
    />
  );
}

/** The whole screen: a back eyebrow, then the state. */
export function LoadFailedScreen(
  props: LoadFailedProps & { readonly backLabel: string; readonly fallback: Href },
) {
  const styles = useStyles();
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID={`${props.testID}-screen`}>
      <View style={styles.header}>
        <BackEyebrow
          label={props.backLabel}
          fallback={props.fallback}
          testID={`${props.testID}-back`}
        />
      </View>
      <View style={styles.body}>
        <LoadFailed offline={props.offline} onRetry={props.onRetry} testID={props.testID} />
      </View>
    </Scaffold>
  );
}
