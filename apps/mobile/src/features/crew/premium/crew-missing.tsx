/**
 * A crew page opened before its crew has synced (loading) or for a crew this phone does not have:
 * the push header with the way back and one line.
 */
import { t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';

import { LoadingCritter, Text } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

export function CrewMissing({
  loading,
  backLabel,
}: {
  readonly loading: boolean;
  readonly backLabel: string;
}) {
  return (
    <PushScreen
      title={t({ id: 'crew.premium.settings.title', message: 'Crew' })}
      backLabel={backLabel}
      testID={loading ? 'crew-settings-loading' : 'crew-settings-missing'}
    >
      <View style={styles.body}>
        {loading ? (
          <LoadingCritter
            label={t({ id: 'crew.premium.loading', message: 'Tokek is fetching the crew…' })}
          />
        ) : (
          <Text variant="body" tone="muted" align="center">
            {t({
              id: 'crew.settings.missing',
              message: 'This crew isn’t on your phone yet. It shows up once it syncs.',
            })}
          </Text>
        )}
      </View>
    </PushScreen>
  );
}

const styles = StyleSheet.create({ body: { padding: 40, alignItems: 'center' } });
