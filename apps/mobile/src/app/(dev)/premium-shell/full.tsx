import { StyleSheet, View } from 'react-native';

import { Text, usePremiumTheme } from '@/ui/premium';
import { FullScreen } from '@/ui/premium/shell';

export const __CP_DEV_ROUTE__ = true;

/** The full-screen type: one job, ✕ top-left on clear glass, the window at full brightness. */
export default function DemoFull() {
  const t = usePremiumTheme();
  return (
    <FullScreen closeLabel="Close" brighten testID="premium-shell-full">
      <View style={[styles.body, { backgroundColor: t.color.inkFillBottom }]}>
        <Text variant="label" color={t.color.onInk}>
          BOARDING PASS · DPS → SIN
        </Text>
        <Text variant="hero" color={t.color.onInk}>
          SQ 943
        </Text>
      </View>
    </FullScreen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
});
