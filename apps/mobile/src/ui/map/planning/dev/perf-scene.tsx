/**
 * The planning map's frame budget, measured on the device it runs on: the same camera script
 * (pans and zooms around Ubud) runs over today's map, 40 pins as live views, and then over 500
 * places drawn as layers. The layers pass when they miss no more UI frames and draw nearly as
 * many map frames as the 40 pins, whatever the device's own speed.
 */
/* eslint-disable lingui/no-unlocalized-strings -- lab copy, loaded only by the (dev) lab. */
import { Marker, type LngLat } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PillButton } from '../../../buttons/PillButton';
import { Text } from '../../../text/Text';
import { makeStyles } from '../../../theme';
import { DoodlePin } from '../../DoodlePin';
import { PlaceDotsLayer } from '../place-dots-layer';
import { PlanningMapCanvas } from '../planning-map-canvas';
import { usePlanningCamera } from '../use-planning-camera';
import { baliPlaces, UBUD } from './bali-fixture';
import { useFrameMeter, withinBudget, type FrameReading } from './frame-meter';

type Phase = 'idle' | 'markers' | 'layers' | 'done';

/** Tiles load before a run starts. */
const SETTLE_MS = 4000;
const STEP_MS = 1000;
const SCRIPT: readonly { readonly center: LngLat; readonly zoom: number }[] = [
  { center: [UBUD[0] + 0.03, UBUD[1]], zoom: 13 },
  { center: [UBUD[0] + 0.03, UBUD[1] - 0.03], zoom: 13 },
  { center: [UBUD[0], UBUD[1]], zoom: 15 },
  { center: [UBUD[0] - 0.02, UBUD[1] + 0.01], zoom: 15 },
  { center: [UBUD[0], UBUD[1]], zoom: 12 },
  { center: [UBUD[0] + 0.01, UBUD[1] - 0.01], zoom: 14 },
  { center: [UBUD[0], UBUD[1]], zoom: 13 },
];
const BASELINE_PINS = 40;

const useStyles = makeStyles((t) => ({
  panel: {
    position: 'absolute',
    start: t.size.gutter,
    end: t.size.gutter,
    bottom: t.space['32'],
    padding: t.space['16'],
    gap: t.space['8'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
  },
}));

function describe(reading: FrameReading | undefined): string {
  if (reading === undefined) return '–';
  const pct = (reading.uiDropRatio * 100).toFixed(1);
  return `UI missed ${pct}% (${String(reading.uiMissed)}) · map ${reading.mapFps.toFixed(1)} fps`;
}

export function PlanningMapPerfScene() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const camera = usePlanningCamera();
  const meter = useFrameMeter();
  const places = useMemo(() => baliPlaces(500), []);
  const [phase, setPhase] = useState<Phase>('idle');
  const [readings, setReadings] = useState<Partial<Record<'markers' | 'layers', FrameReading>>>({});

  useEffect(() => {
    if (phase !== 'markers' && phase !== 'layers') return undefined;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(() => {
        meter.start();
        SCRIPT.forEach((stop, index) => {
          timers.push(
            setTimeout(
              () => camera.cameraRef.current?.easeTo({ ...stop, duration: STEP_MS - 100 }),
              index * STEP_MS,
            ),
          );
        });
        timers.push(
          setTimeout(() => {
            const reading = meter.stop();
            setReadings((current) => ({ ...current, [phase]: reading }));
            setPhase(phase === 'markers' ? 'layers' : 'done');
          }, SCRIPT.length * STEP_MS),
        );
      }, SETTLE_MS),
    );
    return () => timers.forEach(clearTimeout);
    // One run per phase: the meter and camera are only read when a run's timers fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const passed =
    readings.layers !== undefined && readings.markers !== undefined
      ? withinBudget(readings.layers, readings.markers)
      : null;

  return (
    <View style={StyleSheet.absoluteFill}>
      {phase === 'idle' ? null : (
        <PlanningMapCanvas
          key={phase === 'markers' ? 'markers' : 'layers'}
          initialCenter={[UBUD[0], UBUD[1]]}
          destinationSlug="bali"
          cameraRef={camera.cameraRef}
          onFrame={meter.onMapFrame}
        >
          {phase === 'markers' ? (
            places.slice(0, BASELINE_PINS).map((place) => (
              <Marker key={place.id} lngLat={[place.lng, place.lat]}>
                <DoodlePin name={place.name} iconKey={place.iconKey} categoryLabel={place.name} />
              </Marker>
            ))
          ) : (
            <PlaceDotsLayer places={places} />
          )}
        </PlanningMapCanvas>
      )}
      <View style={[styles.panel, { paddingBottom: insets.bottom }]}>
        <Text variant="title">Map frame budget</Text>
        <Text
          variant="bodySm"
          testID="perf-markers"
        >{`40 pins: ${describe(readings.markers)}`}</Text>
        <Text
          variant="bodySm"
          testID="perf-layers"
        >{`500 layers: ${describe(readings.layers)}`}</Text>
        {passed === null ? (
          <PillButton
            label={phase === 'idle' ? 'Run' : 'Running…'}
            disabled={phase !== 'idle'}
            onPress={() => setPhase('markers')}
            testID="perf-run"
          />
        ) : (
          <Text variant="label" testID={passed ? 'perf-ok' : 'perf-over'}>
            {passed ? 'Within budget' : 'Over budget'}
          </Text>
        )}
      </View>
    </View>
  );
}
