/**
 * One day's map open full screen (7b-2) as drawn: the day's route over the map with ←, the day pill (a
 * picker for another day), the chips (SAVED on, the guide's picks, other days, categories), and
 * the stops as a strip along the bottom: swiping it moves the one label from stop to stop. Saved
 * places the plan check found on the way say how far off the route they are ("ON THE WAY · +3 MIN").
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { IconButton } from '@/ui/buttons/IconButton';
import { MapLabel, usePlanningCamera } from '@/ui/map/planning';
import { DayChips, FilterChipRow } from '@/ui/planning';
import { Sheet } from '@/ui/sheet/Sheet';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import { freeGaps } from '../trip-map/day-gaps';
import { routeDays, type DayRoute } from '../trip-map/day-route';
import { lengthLabel, modeLabel } from '../trip-map/format';
import { categoryChips, mapPlaces, type MapFilter } from '../trip-map/map-places';
import { dayChips } from '../trip-map/sheet-copy';
import { buildStopRows } from '../trip-map/stop-rows';
import { pickedStopOf, viewPoints } from '../trip-map/trip-map-camera';
import { DAY_CHIP, filterChips, nextFilter } from '../trip-map/trip-map-filters';
import { TripMapLayers } from '../trip-map/trip-map-layers';
import type { TripMapModel } from '../trip-map/sheet-props';
import { DayPill } from './day-pill';
import { onTheWay } from './on-the-way';
import { StopStrip } from './stop-strip';

const STRIP = 150;

const useStyles = makeStyles((t) => ({
  top: { position: 'absolute', start: 0, end: 0, gap: t.space['10'] },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['8'],
    paddingHorizontal: t.size.gutter,
  },
  chips: { paddingStart: t.size.gutter },
  strip: { position: 'absolute', start: 0, end: 0 },
  picker: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['24'] },
}));

export interface DayMapViewProps {
  readonly model: TripMapModel;
  readonly dayNo: number;
  readonly onDayNo: (dayNo: number) => void;
  readonly route: DayRoute;
  /** The plan version shown (an idea's fit must answer it to say "on the way"). */
  readonly versionId: string | null;
  readonly onBack: () => void;
  readonly onOpenStop: (stableId: string) => void;
}

export function DayMapView({
  model,
  dayNo,
  onDayNo,
  route,
  versionId,
  onBack,
  onOpenStop,
}: DayMapViewProps) {
  const { t } = useLingui();
  const locale = useLocale();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const camera = usePlanningCamera();
  const [filter, setFilter] = useState<MapFilter>({ kind: 'saved' });
  const [otherDays, setOtherDays] = useState(false);
  const [current, setCurrent] = useState(0);
  const [picking, setPicking] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);
  const day = model.days.find((entry) => entry.dayNo === dayNo) ?? null;
  const rows = useMemo(
    () =>
      day === null
        ? []
        : buildStopRows({
            locale,
            day,
            legs: route.legs,
            startsAtStay: route.startsAtStay,
            gaps: freeGaps(
              day,
              model.members.map((member) => member.uid),
              model.tz,
            ),
            members: model.members,
            me: model.me,
          }),
    [day, locale, route, model.members, model.me, model.tz],
  );
  const places = useMemo(
    () =>
      mapPlaces({
        ideas: model.ideas,
        curated: model.curated,
        planned: model.planned,
        joinIndex: new Map(model.members.map((member) => [member.uid, member.joinIndex])),
        filter,
        showSuggested: true,
      }),
    [model, filter],
  );
  const covered = { top: insets.top + 110, bottom: STRIP + insets.bottom + 24 };
  useEffect(() => {
    if (size.height === 0 || day === null || !ready) return;
    camera.fitPoints(viewPoints(model, day), covered);
    // A new day or size moves the camera, not a re-read of the plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day?.dayNo, size.height, ready]);
  if (day === null) return null;

  const stop = rows[current]?.stop ?? null;
  const settle = (index: number) => {
    setCurrent(index);
    const place = rows[index]?.stop.place;
    if (place != null) camera.flyToPlace([place.lng, place.lat], { zoom: 14, covered });
  };
  // The leg into each card: "Walk", or how long the drive is.
  const shortLegs = rows.map((_, index) => {
    const leg = index === 0 ? null : (rows[index - 1]?.legAfterLeg ?? null);
    if (leg === null) return null;
    return leg.mode === 'walk' ? modeLabel('walk') : lengthLabel(leg.minutes);
  });
  const days = routeDays(otherDays ? model.days : [day]);
  return (
    <Scaffold variant="map" edges={[]} testID="day-map">
      <View style={StyleSheet.absoluteFill} onLayout={(event) => setSize(event.nativeEvent.layout)}>
        <TripMapLayers
          camera={camera}
          center={day.stay === null ? (model.center ?? [0, 0]) : [day.stay.lng, day.stay.lat]}
          zoom={13}
          destinationSlug={model.destinationSlug}
          regionUri={model.regionUri}
          stay={day.stay === null ? null : [day.stay.lng, day.stay.lat]}
          places={places}
          days={days}
          chosenDayNo={day.dayNo}
          pickedStop={
            stop === null ? null : pickedStopOf({ kind: 'stop', id: stop.stableId }, day, locale)
          }
          pickedPlace={null}
          onPick={(picked) => {
            const index = rows.findIndex((row) => row.stop.stableId === picked?.id);
            if (index >= 0) settle(index);
          }}
          onRegion={() => setReady(true)}
        >
          {onTheWay(model.ideas, day.dayNo, versionId).map((idea) => (
            <MapLabel
              key={idea.id}
              lngLat={[idea.lng, idea.lat]}
              title={t({
                id: 'plan.dayPlan.onTheWay',
                message: `On the way · +${idea.minutes} min`,
              })}
              lift={14}
              testID={`day-map-on-the-way-${idea.id}`}
            />
          ))}
        </TripMapLayers>
        <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
          <View style={styles.bar}>
            <IconButton
              label={t({ id: 'plan.dayPlan.backToDay', message: 'Back to the day' })}
              glyph={<Text variant="h3">←</Text>}
              onPress={onBack}
              testID="day-map-back"
            />
            <DayPill day={day} locale={locale} onPress={() => setPicking(true)} />
          </View>
          <View style={styles.chips}>
            <FilterChipRow
              chips={filterChips({
                day,
                dayChosen: true,
                weekday: '',
                saved: model.ideas.length + model.placedCount,
                categories: categoryChips(places),
                filter,
                guidePicks: { name: model.guide.name },
                otherDays: { on: otherDays },
              })}
              onPress={(key) =>
                key === 'other-days'
                  ? setOtherDays((on) => !on)
                  : key === DAY_CHIP
                    ? undefined
                    : setFilter(nextFilter(filter, key))
              }
              testID="day-map-chips"
            />
          </View>
        </View>
        <View style={[styles.strip, { bottom: insets.bottom + 12 }]}>
          <StopStrip
            rows={rows}
            color={day.color}
            legs={shortLegs}
            current={current}
            onSettle={settle}
            onOpen={(row) => onOpenStop(row.stop.stableId)}
            width={size.width}
          />
        </View>
      </View>
      {picking ? (
        <Sheet
          detents={['fit']}
          title={t({ id: 'plan.dayPlan.pickDay', message: 'Pick a day' })}
          onDismiss={() => setPicking(false)}
          testID="day-map-picker"
        >
          <View style={styles.picker}>
            <DayChips
              days={dayChips(model.days, locale)}
              selectedDayNo={day.dayNo}
              onSelect={(n) => {
                onDayNo(n);
                setCurrent(0);
                setPicking(false);
              }}
            />
          </View>
        </Sheet>
      ) : null}
    </Scaffold>
  );
}
