/**
 * The place page's sections (4.36, 4.37): the four fact tiles, "When it fits" with the hour bars
 * (the fitting slot in green, open hours grey, the closing hour low), Know before you go, Next
 * nearby as cards and If you like this as one row.
 */
import { t } from '@lingui/core/macro';
import { ScrollView, View } from 'react-native';

import {
  Card,
  CritterSticker,
  IconButton,
  ListCard,
  PressableScale,
  Text,
  usePremiumTheme,
} from '@/ui/premium';

import type { FitBars, PlaceRef } from '../../place-detail/context';
import { factTileList } from '../../place-detail/fact-tile-model';
import type { FactTiles } from '../../place-detail/context';
import { barsLabel, hourLevels } from '../../place-detail/model';
import { placeIcon } from '../../search/place-icons';
import { Eyebrow, SectionLabel } from '../components/labels';
import { PlaceThumb } from '../components/place-thumb';

export function FactTilesRow({ facts }: { readonly facts: FactTiles }) {
  const theme = usePremiumTheme();
  const tiles = factTileList(facts);
  if (tiles.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', gap: theme.space.gap6 }} testID="place-detail-facts">
      {tiles.map((tile) => (
        <View
          key={tile.key}
          accessible
          accessibilityLabel={`${tile.label}: ${tile.value}`}
          style={{ flex: 1, paddingVertical: 9, paddingHorizontal: theme.space.gap10 }}
        >
          <Eyebrow text={tile.label} />
          <Text variant="rowTextStrong" numberOfLines={1}>
            {tile.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const BAR_MAX = 38;

export function HourBars({ bars }: { readonly bars: FitBars }) {
  const theme = usePremiumTheme();
  const levels = hourLevels(bars);
  const lit = bars.lit;
  const axis = levels.filter((_, index) => index % 4 === 0);
  return (
    <View accessible accessibilityLabel={barsLabel(bars)} testID="place-detail-bars">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 3,
          height: BAR_MAX,
          marginTop: 8,
        }}
      >
        {levels.map((level) => {
          const inSlot = lit !== null && level.hour >= lit.from && level.hour < lit.to;
          const closed = level.hour === bars.to;
          return (
            <View
              key={level.hour}
              style={{
                flex: 1,
                height: closed ? 3 : Math.max(3, Math.round(level.level * BAR_MAX)),
                borderRadius: 3,
                backgroundColor: inSlot
                  ? theme.color.toggleOn
                  : closed
                    ? theme.color.control
                    : theme.color.progressTodo,
              }}
            />
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        {axis.map((level) => (
          <Text key={level.hour} variant="badge" tone="placeholder">
            {String(level.hour).padStart(2, '0')}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function WhenItFitsCard(props: {
  readonly guide: { readonly kind: string; readonly name: string };
  readonly eyebrow: string;
  readonly value: string;
  readonly sentence: string | null;
  readonly bars: FitBars | null;
  readonly onOtherDays: (() => void) | undefined;
}) {
  const theme = usePremiumTheme();
  return (
    <Card padded testID="place-detail-fits">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap10 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: theme.color.status.maybe.bg,
            alignItems: 'center',
            justifyContent: 'flex-end',
            overflow: 'hidden',
          }}
        >
          <CritterSticker kind={props.guide.kind} name={props.guide.name} size={30} edge={false} />
        </View>
        <View style={{ flex: 1 }}>
          <Eyebrow text={props.eyebrow} />
          <Text variant="headline" testID="place-detail-fits-when">
            {props.value}
          </Text>
        </View>
        {props.onOtherDays === undefined ? null : (
          <PressableScale
            onPress={props.onOtherDays}
            accessibilityRole="button"
            testID="place-detail-other-days"
          >
            <Text variant="bannerAction">
              {t({ id: 'explore.premium.place.otherDays', message: 'Other days ›' })}
            </Text>
          </PressableScale>
        )}
      </View>
      {props.sentence === null ? null : (
        <Text variant="note" tone="inkSecondary" style={{ marginTop: theme.space.gap8 }}>
          {props.sentence}
        </Text>
      )}
      {props.bars === null ? null : <HourBars bars={props.bars} />}
    </Card>
  );
}

export function KnowBeforeCard(props: {
  readonly lines: readonly { readonly title: string; readonly detail: string | null }[];
}) {
  const theme = usePremiumTheme();
  if (props.lines.length === 0) return null;
  return (
    <View style={{ gap: theme.space.gap8 }} testID="place-detail-know">
      <SectionLabel>{t({ id: 'explore.detail.know', message: 'Know before you go' })}</SectionLabel>
      <ListCard>
        {props.lines.map((line) => (
          <View
            key={line.title}
            style={{
              flexDirection: 'row',
              gap: theme.space.gap12,
              paddingVertical: theme.space.rowPadVLoose,
              paddingHorizontal: theme.space.rowPadH,
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                marginTop: 7,
                backgroundColor: theme.accent.tangerine,
              }}
            />
            <View style={{ flex: 1 }}>
              <Text variant="rowTextStrong">{line.title}</Text>
              {line.detail === null ? null : (
                <Text variant="captionMuted" tone="muted">
                  {line.detail}
                </Text>
              )}
            </View>
          </View>
        ))}
      </ListCard>
    </View>
  );
}

export function NearbyRow(props: {
  readonly places: readonly PlaceRef[];
  readonly onPlace: (poiId: string) => void;
  readonly onAdd: ((poiId: string) => void) | undefined;
}) {
  const theme = usePremiumTheme();
  if (props.places.length === 0) return null;
  return (
    <View style={{ gap: theme.space.gap8 }} testID="place-detail-nearby">
      <SectionLabel>
        {t({ id: 'explore.premium.place.nearby', message: 'Next, nearby' })}
      </SectionLabel>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -theme.space.gutter }}
        contentContainerStyle={{ gap: theme.space.gap10, paddingHorizontal: theme.space.gutter }}
      >
        {props.places.map((place) => {
          const minutes = place.minutes;
          return (
            <PressableScale
              key={place.poi_id}
              onPress={() => props.onPlace(place.poi_id)}
              accessibilityRole="button"
              accessibilityLabel={place.name}
              testID={`place-detail-nearby-${place.poi_id}`}
            >
              <Card style={{ width: 156, overflow: 'hidden' }}>
                <View
                  style={{
                    height: 84,
                    backgroundColor: theme.color.control,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <PlaceThumb icon={placeIcon(place.category)} size={64} radius={0} />
                </View>
                <View style={{ padding: theme.space.gap10, gap: 2 }}>
                  <Eyebrow
                    text={t({
                      id: 'explore.premium.place.minutesOn',
                      message: `${minutes} min on`,
                    })}
                    color={theme.color.status.rain.text}
                  />
                  <Text variant="rowTextStrong" numberOfLines={1}>
                    {place.name}
                  </Text>
                  {props.onAdd === undefined ? null : (
                    <View style={{ alignItems: 'flex-end' }}>
                      <IconButton
                        icon="plus"
                        size={28}
                        tone="control"
                        label={t({ id: 'search.premium.row.add', message: `Add ${place.name}` })}
                        onPress={() => props.onAdd?.(place.poi_id)}
                      />
                    </View>
                  )}
                </View>
              </Card>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}
