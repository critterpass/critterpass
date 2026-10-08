/**
 * The PASS tab's Critterdex (3l-2) from props: the count and filters, the trip egg, the here-now
 * card, a legendary on your dates, the home set with Explore at home, then every place by rank.
 * FOUND, NEAR ME and a place search narrow the sets; the lab scenes render it with fixed data.
 */
import { upper } from '@cp/i18n';
import { FlashList } from '@shopify/flash-list';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { useActiveGuide } from '@/lib/navigation/active-guide';
import { guideSticker } from '@/ui/avatar/guides';
import { DexHeader } from '@/ui/critters/DexHeader';
import { LegendaryBanner } from '@/ui/critters/LegendaryBanner';
import { SearchField } from '@/ui/inputs/SearchField';
import { SettingsGroup } from '@/ui/inputs/SettingsGroup';
import { Stack } from '@/ui/layout/Stack';
import { GuideLine } from '@/ui/people/GuideLine';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { useTabBarInset } from '@/ui/shell/TabBar';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { spanLabel } from '../critters-copy';
import { EggCard } from '../hatch/egg-card';
import type { SlippedAway } from './slipped-away';
import { SlippedAwayCard } from './slipped-away-card';
import type { EggCard as EggCardModel } from '../hatch/hatch-model';
import { CellArt } from './cell-art';
import {
  comparison,
  emptyFound,
  emptyNear,
  emptySearch,
  exploreAtHome,
  filterGroupLabel,
  filterLabels,
  firstCritterHint,
  legendaryEyebrow,
  legendaryTitle,
  placesLabel,
  searchLabel,
} from './dex-copy';
import { filterSets, setOfCritter, type DexFilter, type DexModel } from './dex-model';
import { withGroups, type Item } from './dex-groups';
import { HereNowCard } from './here-now';
import { ProfileEntry, type DexProfileEntry } from './profile-entry';
import { HomeSetCard, PlaceRow } from './set-rows';
import { useLanded } from './use-landed';

export type { DexProfileEntry } from './profile-entry';

export interface DexViewProps {
  /** The sticker shelf, under the home set (stickers sit outside the dex grid). */
  readonly shelf?: ReactNode;
  readonly state: 'loading' | 'ready';
  readonly model: DexModel;
  readonly near: ReadonlySet<string>;
  readonly filter: DexFilter;
  readonly onFilter: (filter: DexFilter) => void;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly egg: EggCardModel | null;
  readonly hatching?: boolean;
  readonly onHatch: () => void;
  readonly onOpenHatch: () => void;
  /** Null without a home set. */
  readonly exploreAtHome: boolean | null;
  readonly onExploreAtHome: (on: boolean) => void;
  readonly onOpenSet: (setId: string) => void;
  readonly onOpenCritter: (critterId: string) => void;
  /** Where to find a form not found yet: its places, window and steps. */
  readonly onOpenWhere?: (formId: string) => void;
  readonly onOpenLegendaries: () => void;
  /** NEAR ME's map of the trip's critter spots, above the matching sets. */
  readonly nearMap?: ReactNode;
  /** The banner of an encounter under way (it follows the encounter itself), with a way back in. */
  readonly encounterBanner?: ReactNode;
  /**
   * A critter that has just been added to the pass: the list scrolls to its set and outlines the
   * row for a moment, then calls `onLandedShown`.
   */
  readonly landed?: string | null;
  readonly onLandedShown?: () => void;
  /** A find the server could not confirm, told once until dismissed. */
  readonly slippedAway?: SlippedAway | null;
  readonly onDismissSlipped?: () => void;
  /**
   * The person's own face at the end of the title line, opening their profile: the way to the
   * profile and Settings that works before they have a crew. Left out while no profile screen
   * is registered.
   */
  readonly profile?: DexProfileEntry | undefined;
}

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter },
  gap: { height: th.space['10'] },
}));

function Empty({ copy }: { readonly copy: { title: string; body: string } }) {
  const theme = useTheme();
  return (
    <Stack gap="6" style={{ paddingVertical: theme.space['24'] }} testID="critters-dex-empty">
      <Text variant="h3">{copy.title}</Text>
      <Text variant="body" color={theme.semantic.text.secondary}>
        {copy.body}
      </Text>
    </Stack>
  );
}

export function DexView(props: DexViewProps) {
  // The PASS tab is a tab root (3l-2 draws no back).
  useNoBackByDesign();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const inset = useTabBarInset();
  const { guideId } = useActiveGuide();
  const { model, filter, query } = props;
  const landed = props.state === 'ready' ? (props.landed ?? null) : null;
  const landedSet = landed === null ? null : (setOfCritter(model, landed)?.id ?? null);
  const { list, shown: landedShown } = useLanded<Item>(
    landedSet === null ? null : landed,
    landedSet === null ? -1 : withGroups(model.places, true).findIndex((i) => i.key === landedSet),
    props.onLandedShown,
  );
  const landedSetId = landedShown ? landedSet : null;
  if (props.state === 'loading') {
    return (
      <Scaffold variant="dark" edges={['top']} testID="critters-dex-loading">
        <View style={[styles.body, { paddingTop: theme.space['20'], gap: theme.space['12'] }]}>
          <Skeleton preset="lines" repeat={2} />
          <Skeleton preset="card" repeat={3} />
        </View>
      </Scaffold>
    );
  }
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
  const legendary = model.legendary;
  const header: ReactNode = (
    <Stack gap="14" style={{ paddingBottom: theme.space['14'] }}>
      <DexHeader
        found={model.found}
        total={model.total}
        placesLabel={upper(placesLabel(model.placesFound, model.placesTotal), locale)}
        {...(model.comparison === null
          ? {}
          : { comparison: comparison(model.comparison.name, model.comparison.critters) })}
        filters={filterLabels().map((f) => ({ ...f, label: upper(f.label, locale) }))}
        filter={filter}
        onFilter={props.onFilter}
        filterLabel={filterGroupLabel()}
        {...(props.profile === undefined ? {} : { end: <ProfileEntry entry={props.profile} /> })}
        testID="critters-dex-header"
      />
      <SearchField
        value={query}
        onChangeText={props.onQuery}
        label={searchLabel()}
        returnKeyType="search"
        testID="critters-dex-search"
      />
      {filter === 'near' ? props.nearMap : null}
      {narrowed ? null : (
        <>
          {model.found === 0 && model.total > 0 ? (
            <GuideLine
              guide={guideId}
              name={guideSticker(guideId).name}
              line={firstCritterHint()}
              testID="critters-dex-first-hint"
            />
          ) : null}
          {props.slippedAway == null ? null : (
            <SlippedAwayCard
              slipped={props.slippedAway}
              onDismiss={props.onDismissSlipped ?? (() => undefined)}
            />
          )}
          {props.encounterBanner}
          {props.egg === null ? null : (
            <EggCard
              egg={props.egg}
              onHatch={props.onHatch}
              onOpen={props.onOpenHatch}
              busy={props.hatching ?? false}
            />
          )}
          {model.hereNow === null ? null : (
            <HereNowCard
              here={model.hereNow}
              onOpen={props.onOpenCritter}
              {...(props.onOpenWhere === undefined ? {} : { onWhere: props.onOpenWhere })}
            />
          )}
          {legendary === null ? null : (
            <LegendaryBanner
              eyebrow={upper(legendaryEyebrow(), locale)}
              title={upper(
                legendaryTitle(
                  legendary.placeLine,
                  spanLabel(legendary.start, legendary.end, locale),
                ),
                locale,
              )}
              silhouette={
                legendary.critterKey === null ? undefined : (
                  <CellArt
                    critterKey={legendary.critterKey}
                    seed={legendary.critterSeed}
                    city={legendary.placeLine}
                    size={40}
                    name={null}
                    form={null}
                    found={false}
                    gold
                  />
                )
              }
              onPress={props.onOpenLegendaries}
              testID="critters-legendary-banner"
            />
          )}
          {model.home === null ? null : (
            <Stack gap="8">
              <HomeSetCard
                set={model.home}
                onOpen={props.onOpenSet}
                landed={model.home.id === landedSetId}
              />
              {props.exploreAtHome === null ? null : (
                <SettingsGroup
                  rows={[
                    {
                      key: 'explore-at-home',
                      kind: 'toggle',
                      title: exploreAtHome().title,
                      subtitle: exploreAtHome().body,
                      value: props.exploreAtHome,
                      onChange: props.onExploreAtHome,
                    },
                  ]}
                  testID="critters-explore-at-home"
                />
              )}
            </Stack>
          )}
          {props.shelf}
        </>
      )}
    </Stack>
  );
  const empty =
    filter === 'found' ? emptyFound() : filter === 'near' ? emptyNear() : emptySearch(query.trim());
  return (
    <Scaffold variant="dark" edges={['top']} testID="critters-dex">
      <FlashList
        ref={list}
        data={items}
        extraData={landedSetId}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.kind}
        contentContainerStyle={{
          paddingTop: theme.space['12'],
          paddingBottom: inset + theme.space['16'],
          paddingHorizontal: theme.size.gutter,
        }}
        ListHeaderComponent={header}
        ListEmptyComponent={narrowed ? <Empty copy={empty} /> : null}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        renderItem={({ item }) =>
          item.kind === 'group' ? (
            <Text variant="eyebrow" color={theme.semantic.text.secondary}>
              {upper(item.label, locale)}
            </Text>
          ) : narrowed && item.set.home ? (
            <HomeSetCard set={item.set} onOpen={props.onOpenSet} />
          ) : (
            <PlaceRow
              set={item.set}
              onOpen={props.onOpenSet}
              landed={item.set.id === landedSetId}
            />
          )
        }
        testID="critters-dex-list"
      />
    </Scaffold>
  );
}
