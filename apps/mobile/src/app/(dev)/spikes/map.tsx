import * as FileSystem from 'expo-file-system/legacy';
import { Camera, Map } from '@maplibre/maplibre-react-native';
import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';

import daNangDarkStyleJson from '../../../../../../tools/spikes/tiles/style/da-nang-dark.json';

// The style JSON is authored as plain JSON (tools/spikes/tiles/README.md), so its `version`
// field is a plain `number` to TypeScript; MapLibre's `StyleSpecification` requires the literal
// `8`. The draft is hand-verified against the real MapLibre style spec (see the ADR), not
// re-validated structurally here.
const daNangDarkStyle = daNangDarkStyleJson as unknown as StyleSpecification;

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

const REMOTE_PMTILES_URL =
  'https://pub-0cf3d04afb394624afbe8f117d1f198b.r2.dev/da-nang/tiles.pmtiles';
const LOCAL_PMTILES_PATH = `${FileSystem.documentDirectory}da-nang-tiles.pmtiles`;
const DA_NANG_CENTER: [number, number] = [108.15, 16.06];

type DownloadState = 'idle' | 'downloading' | 'done' | 'error';

/**
 * Swaps the style's `pmtiles://` source between the remote R2 URL and a local file path.
 * `expo-file-system`'s `documentDirectory` is already a `file://` URI, so `pmtiles://` + that
 * path is already the correct single-scheme form MapLibre Native's PMTiles reader expects — see
 * the ADR for the two real bugs found getting here (a doubled `file://` prefix reads as
 * "path not found" even though the file exists; the `<Map>` component must be fully remounted
 * — not just given a new `mapStyle` prop — for a `background-pattern` layer to re-apply).
 */
function styleWithSource(url: string): StyleSpecification {
  return {
    ...daNangDarkStyle,
    sources: { ...daNangDarkStyle.sources, openmaptiles: { type: 'vector', url } },
  };
}

export default function MapSpikeScreen() {
  const [downloadState, setDownloadState] = useState<DownloadState>('idle');
  const [downloadMs, setDownloadMs] = useState<number | null>(null);
  const [downloadedBytes, setDownloadedBytes] = useState<number | null>(null);
  const [useLocalFile, setUseLocalFile] = useState(false);
  const [loadEvent, setLoadEvent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const style = useMemo(
    // `expo-file-system`'s `documentDirectory` is itself already a `file://` URI, so the local
    // case needs no extra scheme — `pmtiles://file:///...` (single `file://`), not a doubled one.
    () => styleWithSource(`pmtiles://${useLocalFile ? LOCAL_PMTILES_PATH : REMOTE_PMTILES_URL}`),
    [useLocalFile],
  );

  const downloadCityPack = useCallback(() => {
    setDownloadState('downloading');
    setError(null);
    const start = performance.now();
    FileSystem.downloadAsync(REMOTE_PMTILES_URL, LOCAL_PMTILES_PATH)
      .then(async (result) => {
        const info = await FileSystem.getInfoAsync(LOCAL_PMTILES_PATH);
        setDownloadMs(performance.now() - start);
        setDownloadedBytes(info.exists && 'size' in info ? info.size : null);
        setDownloadState('done');
        console.log(
          JSON.stringify({ msg: 'tiles map spike: city pack downloaded', status: result.status }),
        );
      })
      .catch((cause: unknown) => {
        setDownloadState('error');
        setError(cause instanceof Error ? cause.message : String(cause));
      });
  }, []);

  return (
    <View style={styles.container}>
      <Map
        // Forces a full unmount/remount on source swap: maplibre-react-native's runtime
        // `mapStyle` prop diffing does not reliably re-apply paint (esp. `background-pattern`,
        // which needs the sprite re-registered) when only the source url changes in place — see
        // the ADR's "local pmtiles source swap" finding.
        key={useLocalFile ? 'local' : 'remote'}
        style={styles.map}
        mapStyle={style}
        onDidFinishLoadingMap={() => setLoadEvent('map loaded')}
        onDidFinishLoadingStyle={() => setLoadEvent('style loaded')}
        onDidFailLoadingMap={() => setError('MapLibre failed to load the map (see device logs)')}
      >
        <Camera initialViewState={{ center: DA_NANG_CENTER, zoom: 11 }} />
      </Map>

      <ScrollView contentContainerStyle={styles.panel}>
        <Text accessibilityRole="header" style={styles.title}>
          MapLibre + PMTiles on R2 spike
        </Text>
        <Text style={styles.body}>
          source: {useLocalFile ? 'local file' : 'remote R2 (public bucket)'}
        </Text>
        {loadEvent ? <Text style={styles.body}>last event: {loadEvent}</Text> : null}

        <View style={styles.buttonRow}>
          <Button
            title="Download city pack (offline)"
            onPress={downloadCityPack}
            disabled={downloadState === 'downloading'}
          />
        </View>
        {downloadState === 'done' ? (
          <View style={styles.buttonRow}>
            <Button
              title={useLocalFile ? 'Switch to remote source' : 'Switch to downloaded local file'}
              onPress={() => setUseLocalFile((current) => !current)}
            />
          </View>
        ) : null}

        {downloadMs !== null ? (
          <Text style={styles.body}>
            downloaded {downloadedBytes ?? '?'} bytes in {downloadMs.toFixed(0)} ms
          </Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1, minHeight: 320 },
  panel: { gap: 10, padding: 16 },
  title: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 13 },
  buttonRow: { alignSelf: 'flex-start' },
  error: { color: '#B00020' },
});
