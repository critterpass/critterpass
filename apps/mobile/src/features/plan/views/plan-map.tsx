/**
 * The plan's MAP tab (undesigned; built from the map kit): day filter chips, one line per day in
 * the day's colour through its places, and numbered pins in that colour; tapping a pin opens the
 * item on its day. The destination's region pack draws the map offline once it is downloaded.
 */
/* eslint-disable lingui/no-unlocalized-strings -- MapLibre ids, never copy. */
import { t } from '@lingui/core/macro';
import { Camera, Map as MapLibreMap, ViewAnnotation } from '@maplibre/maplibre-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { tokens } from '@cp/design-tokens';

import type { LegPaths } from '@/data/legs/version-leg-paths';
import { TextLink } from '@/ui/buttons/TextLink';
import { FilterChip } from '@/ui/chips/FilterChip';
import { regionMapStyle, useRegionTiles } from '@/ui/map/region-pack';
import { RegionPackNotice } from '@/ui/map/RegionPackNotice';
import { RouteLine } from '@/ui/map/RouteLine';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { dayTileColour } from '../overview/model/day-colour';
import type { PlanDay, PlanItem } from '../overview/model/plan-model';
import { planMapModel, type MapPin } from './model/views-model';

const MAP_HEIGHT = 440;
const PIN = 28;
const NOTICE_BOTTOM = 12;

const useStyles = makeStyles((th) => ({
  wrap: { gap: th.space['12'] },
  chips: { gap: th.space['8'], paddingRight: th.space['20'] },
  map: {
    height: MAP_HEIGHT,
    borderRadius: th.radius.lg,
    overflow: 'hidden',
    backgroundColor: tokens.color.map.base,
  },
  pin: {
    width: PIN,
    height: PIN,
    borderRadius: PIN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: th.semantic.bg.base,
  },
  // A fixed box: the native annotation measures its child once, before the pin lays out.
  pinBox: { width: PIN + 4, height: PIN + 4, alignItems: 'center', justifyContent: 'center' },
  empty: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: th.space['24'],
  },
}));

export interface PlanMapProps {
  readonly days: readonly PlanDay[];
  readonly items: readonly PlanItem[];
  readonly destinationSlug: string | null;
  /** The destination's name, for the line a destination without a region pack shows. */
  readonly destinationName?: string | null | undefined;
  /** The downloaded region (`file://…pmtiles`), used instead of the network. */
  readonly localRegionUri: string | null;
  /** Offline without the region downloaded: the map can't draw. */
  readonly offlineUnavailable: boolean;
  readonly onDownload: (() => void) | null;
  readonly onOpenItem: (pin: MapPin) => void;
  /** The roads of the version's synced legs, item to item; a pair without one draws straight. */
  readonly legPaths?: LegPaths;
}

function NumberPin({ pin, onPress }: { readonly pin: MapPin; readonly onPress: () => void }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t({
        id: 'plan.map.pin',
        message: `Day ${pin.dayNo}, stop ${pin.number}: ${pin.label}`,
      })}
      onPress={onPress}
      hitSlop={8}
      testID={`plan-map-pin-${pin.stableId}`}
    >
      <View style={[styles.pin, { backgroundColor: dayTileColour(pin.dayNo) }]}>
        <Text variant="label" color={theme.semantic.text.onAccent}>
          {String(pin.number)}
        </Text>
      </View>
    </Pressable>
  );
}

export function PlanMap(props: PlanMapProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [day, setDay] = useState<number | null>(null);
  const model = useMemo(
    () => planMapModel(props.items, day, props.legPaths),
    [props.items, day, props.legPaths],
  );
  const tiles = useRegionTiles(props.destinationSlug, props.localRegionUri);
  const style = useMemo(() => regionMapStyle(tiles.sourceUrl), [tiles.sourceUrl]);
  const padding = { top: 48, bottom: 48, left: 40, right: 40 };
  return (
    <View style={styles.wrap} testID="plan-map">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        <FilterChip
          label={t({ id: 'plan.map.allDays', message: 'All days' })}
          selected={day === null}
          onPress={() => setDay(null)}
          testID="plan-map-day-all"
        />
        {props.days.map((d) => (
          <FilterChip
            key={d.dayNo}
            label={t({ id: 'plan.map.day', message: `Day ${d.dayNo}` })}
            selected={day === d.dayNo}
            onPress={() => setDay(d.dayNo)}
            testID={`plan-map-day-${d.dayNo}`}
          />
        ))}
      </ScrollView>
      <View style={styles.map}>
        {props.offlineUnavailable ? (
          <View style={styles.empty} testID="plan-map-offline">
            <Text variant="body" style={{ textAlign: 'center' }}>
              {t({
                id: 'plan.map.offline',
                message: 'The map needs signal, or the downloaded map of the area.',
              })}
            </Text>
          </View>
        ) : (
          <MapLibreMap style={StyleSheet.absoluteFill} mapStyle={style} logo={false}>
            <Camera
              key={day ?? 'all'}
              initialViewState={
                model.bounds !== null
                  ? { bounds: [...model.bounds], padding }
                  : model.center !== null
                    ? { center: [model.center[0], model.center[1]], zoom: 13 }
                    : { center: [0, 0], zoom: 1 }
              }
            />
            {model.routes.map((route) => (
              <RouteLine
                key={route.dayNo}
                id={`plan-day-${route.dayNo}`}
                coordinates={route.coordinates}
                color={dayTileColour(route.dayNo)}
              />
            ))}
            {model.pins.map((pin) => (
              <ViewAnnotation key={pin.key} lngLat={[pin.lng, pin.lat]} anchor="center">
                <View style={styles.pinBox} collapsable={false}>
                  <NumberPin pin={pin} onPress={() => props.onOpenItem(pin)} />
                </View>
              </ViewAnnotation>
            ))}
          </MapLibreMap>
        )}
        {!props.offlineUnavailable && model.pins.length === 0 ? (
          <View style={styles.empty} pointerEvents="none" testID="plan-map-empty">
            <Text
              variant="body"
              color={theme.semantic.text.secondary}
              style={{ textAlign: 'center' }}
            >
              {t({ id: 'plan.map.empty', message: 'Nothing on this day has a place yet.' })}
            </Text>
          </View>
        ) : null}
        {!props.offlineUnavailable && tiles.awaited && props.destinationName ? (
          <RegionPackNotice place={props.destinationName} bottom={NOTICE_BOTTOM} />
        ) : null}
      </View>
      {props.onDownload ? (
        <TextLink
          label={t({ id: 'plan.map.download', message: 'Keep the map for offline' })}
          onPress={props.onDownload}
          testID="plan-map-download"
        />
      ) : null}
    </View>
  );
}
