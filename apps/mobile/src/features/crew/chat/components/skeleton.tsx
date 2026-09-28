/**
 * First-sync skeleton for the timeline: a few alternating bubble shapes on the shared skeleton
 * shimmer, with the guide's "still syncing" hint if it takes long.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Text } from '@/ui';
import { Skeleton } from '@/ui/states/Skeleton';
import { makeStyles } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  root: { flex: 1, justifyContent: 'flex-end', padding: th.space['16'], gap: th.space['12'] },
}));

export function ChatSkeleton() {
  const styles = useStyles();
  return (
    <View
      style={styles.root}
      accessibilityLabel={t({ id: 'chat.loading', message: 'Loading the chat' })}
      testID="chat-skeleton"
    >
      <Skeleton
        blocks={[
          { width: '62%', height: 40 },
          { width: '48%', height: 40 },
          { width: '70%', height: 56 },
          { width: '40%', height: 40 },
        ]}
        slowHint={
          <Text variant="caption">
            {t({ id: 'chat.loading.slow', message: 'Still syncing the chat…' })}
          </Text>
        }
      />
    </View>
  );
}
