/**
 * A destination with no region pack, as a fresh Đà Lạt trip met it: the map draws the world tiles
 * alone and says a detailed map is on its way. The slug names no destination, so the tiles host
 * answers "not there" for real.
 */
/* eslint-disable lingui/no-unlocalized-strings -- lab fixture names, never shipped copy. */
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { PlanningMapCanvas } from '../planning-map-canvas';

const DA_LAT: [number, number] = [108.4583, 11.9404];

export function NoRegionPackScene() {
  const cameraRef = useRef<CameraRef | null>(null);
  return (
    <View style={StyleSheet.absoluteFill} testID="planning-map-lab-no-pack-scene">
      <PlanningMapCanvas
        initialCenter={DA_LAT}
        initialZoom={11}
        destinationSlug="lab-no-region-pack"
        placeName="Đà Lạt"
        stay={DA_LAT}
        cameraRef={cameraRef}
      />
    </View>
  );
}
