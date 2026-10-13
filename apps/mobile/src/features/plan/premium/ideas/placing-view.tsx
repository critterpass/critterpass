/**
 * The guide placing saved places (4.41): "Ideas · 8" and "Tokek is placing them", the real map in
 * a card with each idea as a white dot that turns into its day's numbered stop as it is placed,
 * the steps (done with a check, the running one with a spinner, the rest waiting), and the foot:
 * leaving doesn't cancel it, Keep browsing. A finished run with nothing to review, or one that
 * failed, says so with its way on. The shared `PlacingScreen` replaces this with the review.
 */
/* eslint-disable lingui/no-unlocalized-strings -- MapLibre ids and wire values, never copy. */
import { t } from '@lingui/core/macro';
import { GeoJSONSource, Layer, type CameraRef } from '@maplibre/maplibre-react-native';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { useMemo, useRef } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, ListCard, Spinner, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import type { PlacingViewProps } from '../../ideas/placing/placing-props';
import { MAP_MARKS, PremiumMapCanvas } from '../map';

const DISC = 22;
const FONT = ['Archivo-W100-700 Regular'];

interface PinProps {
  readonly placed: boolean;
  readonly color: string;
  readonly label: string;
}

export function PremiumPlacingView(props: PlacingViewProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraRef | null>(null);
  const data = useMemo((): FeatureCollection<Point, PinProps> => {
    const features: Feature<Point, PinProps>[] = props.pins.map((pin) => ({
      type: 'Feature',
      id: pin.id,
      geometry: { type: 'Point', coordinates: [pin.lng, pin.lat] },
      properties: {
        placed: pin.stop !== null,
        color: pin.stop?.color ?? MAP_MARKS.pickFill,
        label: pin.stop === null ? '' : String(pin.stop.number),
      },
    }));
    return { type: 'FeatureCollection', features };
  }, [props.pins]);
  const centre: [number, number] =
    props.pins.length === 0
      ? [0, 0]
      : [
          props.pins.reduce((sum, pin) => sum + pin.lng, 0) / props.pins.length,
          props.pins.reduce((sum, pin) => sum + pin.lat, 0) / props.pins.length,
        ];
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.ground }} testID="placing">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.space.gap16,
          paddingHorizontal: theme.space.gap16,
          gap: theme.space.gap16,
        }}
      >
        <View style={{ paddingHorizontal: theme.space.gap8, gap: theme.space.gap4 }}>
          <Text variant="label" tone="muted">
            {props.title}
          </Text>
        </View>
        <View
          style={{
            height: 300,
            borderRadius: 28,
            overflow: 'hidden',
            boxShadow: theme.shadow.card,
          }}
        >
          {props.pins.length === 0 ? null : (
            <PremiumMapCanvas
              cameraRef={camera}
              initialCenter={centre}
              initialZoom={11}
              destinationSlug={null}
              still
              testID="placing-map"
            >
              <GeoJSONSource id="placing-pins" data={data}>
                <Layer
                  id="placing-pin"
                  type="circle"
                  paint={{
                    'circle-radius': ['case', ['get', 'placed'], 11, 5],
                    'circle-color': ['get', 'color'],
                    'circle-stroke-color': [
                      'case',
                      ['get', 'placed'],
                      MAP_MARKS.pinRing,
                      MAP_MARKS.pickRing,
                    ],
                    'circle-stroke-width': ['case', ['get', 'placed'], 2.5, 3],
                  }}
                />
                <Layer
                  id="placing-pin-number"
                  type="symbol"
                  filter={['get', 'placed']}
                  layout={{
                    'text-field': ['get', 'label'],
                    'text-font': FONT,
                    'text-size': 11,
                    'text-allow-overlap': true,
                  }}
                  paint={{ 'text-color': MAP_MARKS.pinNumeral }}
                />
              </GeoJSONSource>
            </PremiumMapCanvas>
          )}
        </View>
        <ListCard>
          {props.lines.map((line) => (
            <View
              key={line.key}
              testID={`placing-step-${line.key}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.gap10,
                paddingVertical: theme.space.gap8,
                paddingHorizontal: theme.space.gap16,
              }}
            >
              {line.status === 'done' ? (
                <View
                  style={{
                    width: DISC,
                    height: DISC,
                    borderRadius: DISC / 2,
                    backgroundColor: theme.color.toggleOn,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="check" size={12} color={theme.color.onInk} />
                </View>
              ) : line.status === 'running' ? (
                <Spinner size={DISC} color={theme.color.ink} trackColor={theme.color.fieldBorder} />
              ) : (
                <View
                  style={{
                    width: DISC,
                    height: DISC,
                    borderRadius: DISC / 2,
                    borderWidth: 2,
                    borderColor:
                      line.status === 'failed'
                        ? theme.color.destructive.fieldRing
                        : theme.color.fieldBorder,
                  }}
                />
              )}
              <Text
                variant={line.status === 'running' ? 'rowTextStrong' : 'rowText'}
                tone={line.status === 'pending' ? 'placeholder' : 'ink'}
                style={{ flex: 1 }}
              >
                {line.text}
              </Text>
            </View>
          ))}
        </ListCard>
      </ScrollView>
      <View
        style={{
          paddingHorizontal: theme.space.titleGutter,
          paddingBottom: insets.bottom + theme.space.gap12,
          gap: theme.space.gap4,
          alignItems: 'center',
        }}
      >
        <Text variant="caption" tone="muted" align="center">
          {props.foot}
        </Text>
        {props.outcome === null ? (
          <TextButton
            label={t({ id: 'plan.premium.placing.keepBrowsing', message: 'Keep browsing' })}
            onPress={props.onLeave}
            testID="placing-leave"
          />
        ) : (
          <TextButton
            label={props.outcome.action}
            onPress={props.outcome.onAction}
            testID="placing-outcome"
          />
        )}
      </View>
    </View>
  );
}
