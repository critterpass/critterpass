/**
 * The Critterdex (8.01), the Pass tab's root: "Your Critterdex" over the big count (found of all),
 * the places tag and a crewmate's count, All / Found / Near me and the place search, then the trip
 * egg, a find that slipped away, the live encounter, the here-now card, the legendary banner, the
 * home set and exploring at home, and the countries in rank groups. A filter or a search narrows
 * the sets, with an empty state when nothing is left; a critter just landed scrolls its set in.
 */
import { t } from '@lingui/core/macro';
import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  GlassIconButton,
  SegmentedControl,
  Skeleton,
  Tag,
  Text,
  TextField,
  usePremiumTheme,
} from '@/ui/premium';

import {
  comparison,
  dexTitle,
  filterGroupLabel,
  filterLabels,
  placesLabel,
  searchLabel,
} from '../../dex/dex-copy';
import { withGroups, type Item } from '../../dex/dex-groups';
import { filterSets, setOfCritter } from '../../dex/dex-model';
import type { DexViewProps } from '../../dex/dex-view-props';
import { useLanded } from '../../dex/use-landed';
import { LiveEncounterBanner } from '../../dex/encounter-banner';
import { DexEmpty, EggCard, ExploreAtHome, SlippedCard } from './dex-extras';
import { PremiumEncounterBanner } from './encounter-banner';
import { HereNowCard } from './here-now-card';
import { HomeSetCard, LegendaryBanner, PlaceRow } from './set-cards';

function CountBlock({ props }: { readonly props: DexViewProps }) {
  const th = usePremiumTheme();
  const { model } = props;
  return (
    <View style={{ gap: 4 }} testID="critters-dex-header">
      <Text variant="label" tone="muted">
        {dexTitle()}
      </Text>
      <View
        style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}
      >
        <Text variant="hero" style={{ fontVariant: ['tabular-nums'] }}>
          {String(model.found)}
          <Text variant="hero" tone="placeholder">{`/${String(model.total)}`}</Text>
        </Text>
        <View style={{ alignItems: 'flex-end', gap: 6, paddingBottom: 8 }}>
          <Tag
            label={placesLabel(model.placesFound, model.placesTotal)}
            color={th.accent.pink}
            rotate={3}
          />
          {model.comparison === null ? null : (
            <Text variant="captionMuted" tone="muted">
              {comparison(model.comparison.name, model.comparison.critters)}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

export function PremiumDexScene(props: DexViewProps) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const { model, filter, query } = props;
  const landed = props.state === 'ready' ? (props.landed ?? null) : null;
  const landedSet = landed === null ? null : (setOfCritter(model, landed)?.id ?? null);
  const { list } = useLanded<Item>(
    landedSet === null ? null : landed,
    landedSet === null ? -1 : withGroups(model.places, true).findIndex((i) => i.key === landedSet),
    props.onLandedShown,
  );
  const narrowed = filter !== 'all' || query.trim() !== '';
  const allSets = [...(model.home === null ? [] : [model.home]), ...model.places];
  const shown = narrowed
    ? filterSets(
        [...(model.hereNow === null ? [] : [model.hereNow.set]), ...allSets],
        filter,
        props.near,
        query,
      )
    : model.places;
  const items = withGroups(shown, !narrowed);
  const header = (
    <View style={{ gap: 14, paddingBottom: 14 }}>
      <CountBlock props={props} />
      <SegmentedControl
        options={filterLabels()}
        value={filter}
        onChange={props.onFilter}
        accessibilityLabel={filterGroupLabel()}
        testID="critters-dex-filter"
      />
      <TextField
        accessibilityLabel={searchLabel()}
        placeholder={searchLabel()}
        value={query}
        onChangeText={props.onQuery}
        returnKeyType="search"
        testID="critters-dex-search"
      />
      {filter === 'near' ? props.nearMap : null}
      {narrowed ? null : (
        <>
          {props.slippedAway == null ? null : (
            <SlippedCard
              slipped={props.slippedAway}
              onDismiss={props.onDismissSlipped ?? (() => undefined)}
            />
          )}
          <LiveEncounterBanner Banner={PremiumEncounterBanner} />
          {props.egg === null ? null : (
            <EggCard
              egg={props.egg}
              busy={props.hatching ?? false}
              onHatch={props.onHatch}
              onOpen={props.onOpenHatch}
            />
          )}
          {model.hereNow === null ? null : (
            <HereNowCard
              here={model.hereNow}
              onOpen={props.onOpenCritter}
              {...(props.onOpenWhere === undefined ? {} : { onWhere: props.onOpenWhere })}
            />
          )}
          {model.legendary === null ? null : (
            <LegendaryBanner legendary={model.legendary} onPress={props.onOpenLegendaries} />
          )}
          {model.home === null ? null : <HomeSetCard set={model.home} onOpen={props.onOpenSet} />}
          {props.exploreAtHome === null ? null : (
            <ExploreAtHome on={props.exploreAtHome} onChange={props.onExploreAtHome} />
          )}
        </>
      )}
    </View>
  );
  return (
    <View
      style={{ flex: 1, backgroundColor: th.color.ground, paddingTop: insets.top }}
      testID="critters-dex"
    >
      <Stack.Screen options={{ headerShown: false }} />
      {/* Pushed from the passport's Critterdex row: the glass back goes there. */}
      {router.canGoBack() ? (
        <View style={{ paddingHorizontal: th.space.gutter, paddingVertical: 6 }}>
          <GlassIconButton
            icon="back"
            label={t({ id: 'critters.premium.dex.back', message: 'Back' })}
            onPress={() => router.back()}
            testID="critters-dex-back"
          />
        </View>
      ) : null}
      {props.state === 'loading' ? (
        <View style={{ padding: 20, gap: 12 }} testID="critters-dex-loading">
          <Skeleton height={64} radius={20} width="60%" />
          <Skeleton height={180} radius={26} />
          <Skeleton height={140} radius={24} />
        </View>
      ) : (
        <FlashList
          ref={list}
          data={items}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.kind}
          contentContainerStyle={{
            paddingHorizontal: th.space.gutter,
            paddingBottom: insets.bottom + 24,
          }}
          // The count block stands in for the large title (the design draws no title row).
          ListHeaderComponent={header}
          ListEmptyComponent={narrowed ? <DexEmpty filter={filter} query={query} /> : null}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) =>
            item.kind === 'group' ? (
              <Text variant="label" tone="muted" style={{ marginTop: 8 }}>
                {item.label.toLocaleUpperCase(locale)}
              </Text>
            ) : narrowed && item.set.home ? (
              <HomeSetCard set={item.set} onOpen={props.onOpenSet} />
            ) : (
              <PlaceRow set={item.set} onOpen={props.onOpenSet} />
            )
          }
          testID="critters-dex-list"
        />
      )}
    </View>
  );
}
