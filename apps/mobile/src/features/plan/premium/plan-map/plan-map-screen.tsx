/**
 * The plan on one map (4.25 peek, 4.26 one day at half, 4.27 the whole trip at full): the light or
 * night map with the chosen day traced from the stay, the top chrome (back, search, the plan's ⋯),
 * and the sheet whose content follows its height. The camera fits the chosen day (or the trip)
 * into the map left between the chrome and the sheet, and again when the day or the height
 * changes. At half the day's stops reorder in place; a stop's menu opens from its ⋯ or a hold that
 * never moves.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { hrefFor, useScreenHref } from '@/lib/navigation/screen-registry';
import { guideSticker } from '@/ui/avatar/guides';
import { GuideNote, usePremiumReducedMotion, usePremiumTheme } from '@/ui/premium';

import { tripCheckLine, peekCheckLine } from '../../trip-map/sheet-copy';
import { useOpenOnDate } from '../../trip-map/chosen-day';
import { ShareSheet } from '../../trip-map/share-sheet';
import { PlanRouteLayer, PremiumMapCanvas, StayFlag, type MapDetent } from '../map';
import { AddBar } from './add-bar';
import { planMapCopy } from './copy';
import { DayChips } from './day-chips';
import { DayHead } from './day-head';
import { EmptyPlan } from './empty-plan';
import { framePoints, mapDays } from './map-days';
import { PlacesLayer } from './places-layer';
import { PlanMapSheet } from './plan-map-sheet';
import { PlanMoreMenu } from './plan-more-menu';
import { StopOverlays } from './stop-overlays';
import { Timeline } from './timeline';
import { TripRows } from './trip-rows';
import { TopBar } from './top-bar';
import { useMapCamera } from './use-map-camera';
import { useMapFilters } from './use-map-filters';
import { usePlanMap } from './use-plan-map';

export interface PlanMapScreenProps {
  readonly tripId: string;
  readonly day?: number | null | undefined;
  /** The day to open on by its date (`YYYY-MM-DD`), when a link names it that way. */
  readonly date?: string | null | undefined;
  readonly sheet?: MapDetent | undefined;
}

export function PlanMapScreen(props: PlanMapScreenProps) {
  const { tripId, sheet } = props;
  const map = usePlanMap(tripId, props.day ?? null);
  const { model, data, day } = map;
  const finding = useOpenOnDate(tripId, props.date, model.days, data.loaded);
  const { height } = useWindowDimensions();
  const reduced = usePremiumReducedMotion();
  const scheme = usePremiumTheme().scheme;
  const camera = useRef<CameraRef>(null);
  const [detent, setDetent] = useState<MapDetent>(model.empty ? 'half' : (sheet ?? 'peek'));
  const [menu, setMenu] = useState<number | null>(null);
  const [stopMenu, setStopMenu] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const guide = guideSticker(model.guide.id);
  const search = useScreenHref('7d-1', {
    tripId,
    ...(detent === 'half' && day?.dayId != null ? { scope: 'day', dayId: day.dayId } : {}),
  });

  const layer = useMapFilters({ model, day, detent, locale: map.locale });
  const chosenDayNo = detent === 'full' || !layer.traced ? null : map.dayNo;
  const days = useMemo(
    () =>
      mapDays({
        days: model.days,
        legPaths: model.legPaths,
        chosenLegs: map.route.legs,
        chosenDayNo,
        order: map.reorder.preview,
      }),
    [model.days, model.legPaths, map.route.legs, chosenDayNo, map.reorder.preview],
  );
  const stay = day?.stay ?? null;

  // The camera frames the day (or the trip) inside the map the chrome and the sheet leave.
  const points = useMemo(
    () =>
      framePoints({
        days: model.days,
        chosen: detent === 'full' ? null : day,
        saved: model.ideas.map((idea) => [idea.lng, idea.lat] as const),
        center: model.center,
      }),
    [model.days, model.ideas, model.center, day, detent],
  );
  useMapCamera({ camera, points, detent, height, reduced });

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/hub/${tripId}`));
  const checkLine = peekCheckLine(
    model.check,
    map.locale,
    model.startDate,
    data.today ?? undefined,
  );
  const checkHref = { pathname: '/[tripId]/check', params: { tripId } } as const;
  const placeName = model.destination ?? '';

  const head =
    detent === 'full' ? null : (
      <DayChips
        chips={map.chips}
        chosen={map.dayNo}
        size={detent === 'peek' ? 'large' : 'small'}
        onChoose={map.setDay}
      />
    );

  if (!data.loaded || finding) return null;
  return (
    <View style={styles.screen} testID="trip-map">
      <PremiumMapCanvas
        cameraRef={camera}
        initialCenter={
          stay === null ? [model.center?.[0] ?? 0, model.center?.[1] ?? 0] : [stay.lng, stay.lat]
        }
        destinationSlug={model.destinationSlug}
        localRegionUri={model.regionUri}
        still={detent === 'full'}
      >
        <PlacesLayer
          places={layer.places}
          onPick={(placeId) => {
            const place = hrefFor('7e-1', { placeId, tripId });
            if (place !== undefined) router.push(place);
          }}
        />
        <PlanRouteLayer
          days={days}
          chosenDayNo={chosenDayNo}
          stay={stay === null ? null : [stay.lng, stay.lat]}
          mode={scheme === 'dark' ? 'night' : 'light'}
          size={detent === 'full' ? 'small' : detent === 'peek' ? 'medium' : 'large'}
          onSelectStop={(id) => {
            setDetent('half');
            setStopMenu(id);
          }}
        />
        {stay === null ? null : (
          <StayFlag
            lngLat={[stay.lng, stay.lat]}
            label={detent === 'full' ? null : planMapCopy.stay()}
            accessibilityLabel={planMapCopy.stay()}
          />
        )}
      </PremiumMapCanvas>
      {detent === 'full' ? null : (
        <TopBar
          placeholder={planMapCopy.search(placeName, model.guide.name)}
          guide={{ kind: guide.kind, name: guide.name }}
          labels={{ back: planMapCopy.back(), more: planMapCopy.more() }}
          chips={layer.chips}
          onBack={back}
          onSearch={() => {
            if (search !== undefined) router.push(search);
          }}
          onMore={setMenu}
          onChip={layer.onChip}
        />
      )}
      <PlanMapSheet
        detent={detent}
        onDetent={setDetent}
        height={height}
        head={head}
        bodyBottom={detent === 'half' ? 90 : 0}
        accessibilityLabel={placeName}
      >
        {model.empty ? (
          <EmptyPlan model={model} />
        ) : detent === 'full' ? (
          <TripRows
            rows={map.tripRows}
            guideName={model.guide.name}
            check={(() => {
              const line = tripCheckLine(model.check);
              return line === null
                ? null
                : { line, action: planMapCopy.see(), onPress: () => router.push(checkHref) };
            })()}
            ideas={
              model.ideas.length === 0
                ? null
                : {
                    line: planMapCopy.ideasLine(model.ideas.length),
                    action: `${planMapCopy.ideas()} ›`,
                    onPress: () => router.push({ pathname: '/[tripId]/ideas', params: { tripId } }),
                  }
            }
            onOpenDay={(n) => {
              map.setDay(n);
              setDetent('half');
            }}
          />
        ) : day === null ? null : (
          <View style={{ gap: 12, paddingTop: detent === 'peek' ? 14 : 10 }}>
            <DayHead
              dayNo={day.dayNo}
              eyebrow={map.eyebrow}
              title={day.theme ?? day.area?.name ?? map.eyebrow}
              size={detent === 'peek' ? 'peek' : 'half'}
              line={detent === 'peek' ? map.dayLine : null}
            />
            {detent === 'peek' && checkLine !== null ? (
              <GuideNote
                name={model.guide.name}
                text={checkLine}
                showName={false}
                action={{ label: planMapCopy.check(), onPress: () => router.push(checkHref) }}
                testID="plan-peek-check"
              />
            ) : null}
            {detent === 'half' ? (
              <Timeline
                dayNo={day.dayNo}
                rows={map.rows}
                lifted={map.liftedTime}
                labels={{
                  booked: planMapCopy.booked(),
                  menu: planMapCopy.stopMenu(),
                  drop: planMapCopy.dropSlot(),
                }}
                onLift={model.readOnly ? null : (index) => map.reorder.lift(index).ok}
                onCross={map.reorder.cross}
                onDrop={() => void map.reorder.drop()}
                onCancel={map.reorder.cancel}
                onOpenMenu={setStopMenu}
              />
            ) : null}
          </View>
        )}
      </PlanMapSheet>
      {detent === 'half' && !model.readOnly && !model.empty ? (
        <View style={styles.addBar}>
          <AddBar
            label={planMapCopy.addTo(map.chips.find((c) => c.dayNo === map.dayNo)?.weekday ?? '')}
            guide={{ kind: guide.kind, name: guide.name }}
            onPress={() => {
              if (search !== undefined) router.push(search);
            }}
          />
        </View>
      ) : null}
      {menu === null ? null : (
        <PlanMoreMenu
          tripId={tripId}
          anchorY={menu}
          ideas={model.ideas.length}
          dayNo={map.dayNo}
          onShare={() => setSharing(true)}
          onClose={() => setMenu(null)}
        />
      )}
      {stopMenu === null ? null : (
        <StopOverlays
          tripId={tripId}
          map={map}
          stopId={stopMenu}
          onClose={() => setStopMenu(null)}
        />
      )}
      {sharing ? (
        <ShareSheet plan={data.plan} days={model.days} onClose={() => setSharing(false)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  addBar: { position: 'absolute', left: 16, right: 16, bottom: 28 },
});
