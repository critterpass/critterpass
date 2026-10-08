/**
 * The day plan's live mini-map (7b-1): the day's route from the stay, numbered as the timeline is,
 * redrawn in the dragged order while a stop is held, with the off-screen stops' edge pills, ⤢ and
 * "5 STOPS · 2H40 IN THE CAR" on a fade of the sheet surface so it reads over any map label. It
 * doesn't pan: a tap opens the day's map full screen (7b-2). It opens on the day's stops and fits
 * them again whenever they change (a stop added, moved or removed), so it never shows an empty map.
 */
import { useLingui } from '@lingui/react/macro';
import type { LngLatBounds } from '@maplibre/maplibre-react-native';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';

import {
  EdgeIndicator,
  StopRouteLayer,
  PlanningMapCanvas,
  usePlanningCamera,
} from '@/ui/map/planning';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { routeDays } from '../trip-map/day-route';
import type { TripDay } from '../trip-map/trip-days';
import { fitSignature, openingCamera, viewPoints } from '../trip-map/trip-map-camera';
import { useFitCamera } from '../trip-map/use-fit-camera';
import type { TripMapModel } from '../trip-map/sheet-props';

const HEIGHT = 172;
/** The caption's backing: a fade into the sheet surface, then the surface under the line. */
const CAPTION_BAND = 48;
/** An edge pill's name is cut to this, so the pill never outgrows the mini-map. */
const EDGE_NAME_MAX = 16;

/** A stop's name short enough for an edge pill on the mini-map. */
export function edgeName(title: string): string {
  return title.length <= EDGE_NAME_MAX ? title : `${title.slice(0, EDGE_NAME_MAX - 1).trimEnd()}…`;
}

/** `#rrggbb` with an alpha channel. */
function withAlpha(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

const useStyles = makeStyles((t) => ({
  frame: {
    height: HEIGHT,
    borderRadius: t.radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: t.semantic.border.decorative,
  },
  expand: { position: 'absolute', top: t.space['10'], end: t.space['12'] },
  caption: {
    position: 'absolute',
    bottom: t.space['10'],
    start: t.space['12'],
    end: t.space['12'],
  },
  band: { position: 'absolute', start: 0, end: 0, bottom: 0, height: CAPTION_BAND },
}));

export interface MiniMapProps {
  readonly model: Pick<
    TripMapModel,
    'destinationSlug' | 'regionUri' | 'ideas' | 'center' | 'days' | 'legPaths'
  >;
  readonly day: TripDay;
  /** The order being dragged, by stable id; null shows the plan's order. */
  readonly order: readonly string[] | null;
  readonly caption: string;
  readonly onOpen: () => void;
  /** False while another screen covers the day plan: the camera waits. @default true */
  readonly active?: boolean | undefined;
}

export function MiniMap({ model, day, order, caption, onOpen, active = true }: MiniMapProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const camera = usePlanningCamera();
  const [bounds, setBounds] = useState<LngLatBounds | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const route = useMemo(() => {
    // A dragged order keeps the roads of the pairs it still has and draws new pairs straight.
    const [base] = routeDays([day], model.legPaths);
    if (base === undefined || order === null) return base;
    const byId = new Map(base.stops.map((stop) => [stop.id, stop]));
    const stops = order.flatMap((id) => {
      const stop = byId.get(id);
      return stop === undefined ? [] : [stop];
    });
    return { ...base, stops: stops.map((stop, index) => ({ ...stop, n: index + 1 })) };
  }, [day, order, model.legPaths]);
  const points = useMemo(() => viewPoints({ ...model, days: [day] }, day), [model, day]);
  useFitCamera(camera, {
    fitKey: `${fitSignature(day)}|${String(size.width)}`,
    ready: size.width > 0 && bounds !== null,
    points,
    bounds,
    active,
  });
  // Opens on the day's stops (the middle of them, not the first one): a lost first fit still
  // shows the day.
  const [opening] = useState(() =>
    openingCamera(points, {
      width: Dimensions.get('window').width - 2 * theme.size.gutter,
      height: HEIGHT,
    }),
  );
  const centre: readonly [number, number] = opening?.center ?? model.center ?? [0, 0];
  return (
    <PressScale
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={t({ id: 'plan.dayPlan.openMap', message: 'Open the day’s map' })}
      accessibilityHint={caption}
      testID="day-plan-mini-map"
    >
      <View style={styles.frame} onLayout={(event) => setSize(event.nativeEvent.layout)}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <PlanningMapCanvas
            initialCenter={[centre[0], centre[1]]}
            initialZoom={opening?.zoom ?? 12}
            compact
            destinationSlug={model.destinationSlug}
            localRegionUri={model.regionUri}
            stay={day.stay === null ? null : [day.stay.lng, day.stay.lat]}
            cameraRef={camera.cameraRef}
            onRegionChange={(region) => setBounds(region.bounds)}
            testID="day-plan-mini-map-canvas"
          >
            {route === undefined ? null : (
              <StopRouteLayer
                id="cp-mini"
                days={[route]}
                chosenDayNo={day.dayNo}
                stay={day.stay === null ? null : [day.stay.lng, day.stay.lat]}
              />
            )}
          </PlanningMapCanvas>
          <EdgeIndicator
            stops={(route?.stops ?? []).map((stop) => ({
              ...stop,
              name: edgeName(day.stops.find((one) => one.stableId === stop.id)?.title ?? ''),
              color: day.color,
            }))}
            bounds={bounds}
            size={size}
          />
        </View>
        {size.width > 0 ? (
          <Canvas style={styles.band} pointerEvents="none">
            <Rect x={0} y={0} width={size.width} height={CAPTION_BAND}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(0, CAPTION_BAND)}
                colors={[0, 0.88, 0.92].map((alpha) => withAlpha(theme.semantic.bg.base, alpha))}
                positions={[0, 0.45, 1]}
              />
            </Rect>
          </Canvas>
        ) : null}
        <Text variant="label" style={styles.expand}>
          ⤢
        </Text>
        <Text variant="label" color={theme.color.paper.bright} style={styles.caption}>
          {caption}
        </Text>
      </View>
    </PressScale>
  );
}
