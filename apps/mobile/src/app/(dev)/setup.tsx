import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { SETUP_SCENES } from '@/features/setup/scenes';
import { Text } from '@/ui';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** Trip setup scenes (3c-3…3c-10 and their states) over fixed data, for review and screenshots. */
export default function SetupScenes() {
  const [scene, setScene] = useState<string | null>(null);
  const shown = SETUP_SCENES.find((candidate) => candidate.name === scene);
  if (shown !== undefined) {
    return (
      <View style={styles.fill}>
        {shown.render()}
        <Pressable
          testID="setup-scene-back"
          accessibilityLabel="Back to scenes"
          style={styles.back}
          onPress={() => setScene(null)}
        />
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.list}>
      {SETUP_SCENES.map(({ name }) => (
        <Pressable
          key={name}
          testID={`setup-scene-${name}`}
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
  back: { position: 'absolute', bottom: 0, start: 0, width: 28, height: 28 },
  list: { padding: 16, gap: 8, paddingTop: 64 },
  row: { padding: 14, borderRadius: 10, backgroundColor: '#1f1b38' },
});
