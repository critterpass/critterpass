import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  LIVE_MAP_SCENES,
  LiveMapScene,
  type LiveMapSceneName,
} from '@/features/crew/live-map/scenes';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** Crew live map scenes (3g-4 and its states) over fixed data, for review and screenshots. */
export default function LiveMapScenes() {
  const [scene, setScene] = useState<LiveMapSceneName | null>(null);
  if (scene !== null) return <LiveMapScene scene={scene} onBack={() => setScene(null)} />;
  return (
    <ScrollView contentContainerStyle={styles.list}>
      {LIVE_MAP_SCENES.map((name) => (
        <Pressable
          key={name}
          testID={`live-map-scene-${name}`}
          style={styles.row}
          onPress={() => setScene(name)}
        >
          <View>
            <Text style={styles.label}>{name}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8, paddingTop: 64 },
  row: { padding: 14, borderRadius: 10, backgroundColor: '#1f1b38' },
  label: { color: '#f4efe4', fontSize: 16 },
});
