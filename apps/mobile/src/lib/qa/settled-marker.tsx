import { usePathname } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { isLayoutSettled, subscribeLayoutSettled } from './layout-settled';
import { readCaptureHoldLink } from './capture-hold';
import { announceQaBuild, qaBuildLabel, UI_QA_ENABLED } from './ui-qa';

/**
 * A 2pt invisible box at the screen's bottom-left corner that tells a Maestro flow the screen it
 * shows is ready for its screenshot, in development and e2e builds only. Its id is `qa-settled`
 * once the layout scan (./layout-scan) has measured the focused screens, and `qa-busy` from the
 * next layout or navigation until then; its label is `js:<commit> path:<route>`. A flow waits for
 * `qa-settled` with the route it expects instead of comparing screenshots until two agree, and
 * the label proves which JS build is running. The log line `[qa-build] js:<commit>` is written
 * when it mounts (./ui-qa).
 */
export function QaSettledMarker() {
  const pathname = usePathname();
  const settled = useSyncExternalStore(subscribeLayoutSettled, isLayoutSettled, isLayoutSettled);
  useEffect(() => {
    announceQaBuild();
  }, []);
  // Capture links can ask for a toast or a zoom held long enough to be shot (./capture-hold).
  useEffect(() => {
    if (!UI_QA_ENABLED) return undefined;
    const subscription = Linking.addEventListener('url', ({ url }) => readCaptureHoldLink(url));
    return () => subscription.remove();
  }, []);
  if (!UI_QA_ENABLED) return null;
  return (
    <View
      pointerEvents="none"
      testID={settled ? 'qa-settled' : 'qa-busy'}
      accessibilityLabel={`${qaBuildLabel()} path:${pathname}`}
      style={styles.marker}
    />
  );
}

const styles = StyleSheet.create({
  marker: { position: 'absolute', left: 0, bottom: 0, width: 2, height: 2 },
});
