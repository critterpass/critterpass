import { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DRAFT_SCENES, sceneExit } from '@/features/plan/draft/scenes';
import { Text } from '@/ui';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** A scene that throws shows its error here (dev only), so a device run's screenshot names it. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.list} testID="draft-scene-error">
        <Text variant="rowTitle">{error.message}</Text>
        <Text variant="caption">{error.stack ?? ''}</Text>
      </ScrollView>
      <Pressable
        testID="draft-scene-back"
        accessibilityLabel="Back to scenes"
        style={styles.back}
        onPress={() => void retry()}
      />
    </View>
  );
}

/** Drafting scenes (3c-8, 3c-9, 3c-11, 3c-12, 4f-3 and their states) over fixed data. */
export default function DraftScenes() {
  const [scene, setScene] = useState<string | null>(null);
  const shown = DRAFT_SCENES.find((candidate) => candidate.name === scene);
  // Android's back returns to the list (screenshot flows press it between scenes).
  useEffect(() => {
    sceneExit.current = () => setScene(null);
    if (scene === null) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setScene(null);
      return true;
    });
    return () => sub.remove();
  }, [scene]);
  if (shown !== undefined) {
    return (
      <View style={styles.fill}>
        {shown.render()}
        <Pressable
          testID="draft-scene-back"
          accessibilityLabel="Back to scenes"
          style={styles.back}
          onPress={() => setScene(null)}
        />
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.list} testID="draft-scene-list">
      {DRAFT_SCENES.map(({ name }) => (
        <Pressable
          key={name}
          testID={`draft-scene-${name}`}
          style={styles.row}
          onPress={() => setScene(name)}
        >
          <Text variant="rowTitle">{name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  back: { position: 'absolute', top: 0, end: 0, width: 44, height: 44 },
  list: { padding: 16, gap: 8, paddingTop: 64 },
  row: { padding: 14, borderRadius: 10, backgroundColor: '#1f1b38' },
});
