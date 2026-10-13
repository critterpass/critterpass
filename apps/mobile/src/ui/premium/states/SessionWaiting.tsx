import { t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNoBackByDesign } from '@/lib/qa/back-affordance';

import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { LoadingCritter } from './Skeleton';

/**
 * The premium wait while the session starts (a cold link or a restored launch opens a session-only
 * screen before the local database is open): the premium ground with the thinking critter near the
 * bottom, the way every premium loading screen reads. The screen that follows carries the way back.
 */
export function PremiumSessionWaiting({ testID }: { readonly testID?: string }) {
  useNoBackByDesign();
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.color.ground, paddingBottom: insets.bottom + theme.space.gap16 },
      ]}
      {...(testID === undefined ? {} : { testID })}
    >
      <LoadingCritter
        label={t({ id: 'common.premium.sessionWaiting', message: 'Opening your trips…' })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
});
