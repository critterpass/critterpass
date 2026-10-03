/**
 * The PASS tab's Critterdex (3l-2) from props: the count and filters, the trip egg, the here-now
 * card, a legendary on your dates, the home set with Explore at home, then every place by rank.
 * FOUND, NEAR ME and a place search narrow the sets; the lab scenes render it with fixed data.
 */
import { upper } from '@cp/i18n';
import { t } from '@lingui/core/macro';
import { FlashList } from '@shopify/flash-list';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { GUIDE_STICKERS, type GuideAvatarId } from '@/ui/avatar/guides';
import { DexHeader } from '@/ui/critters/DexHeader';
import { LegendaryBanner } from '@/ui/critters/LegendaryBanner';
import { SearchField } from '@/ui/inputs/SearchField';
import { SettingsGroup } from '@/ui/inputs/SettingsGroup';
import { Stack } from '@/ui/layout/Stack';
import { Avatar } from '@/ui/people/Avatar';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { useTabBarInset } from '@/ui/shell/TabBar';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, touchSlop, useTheme } from '@/ui/theme';

import { spanLabel } from '../critters-copy';
import { EggCard } from '../hatch/egg-card';
import type { EggCard as EggCardModel } from '../hatch/hatch-model';
import { CellArt } from './cell-art';
import {
  comparison,
  emptyFound,
  emptyNear,
  emptySearch,
  exploreAtHome,
  filterLabels,
  legendaryEyebrow,
  legendaryTitle,
  placesLabel,
  rankGroup,
  searchLabel,
} from './dex-copy';
import { filterSets, type DexFilter, type DexModel, type SetModel } from './dex-model';
import { EncounterBanner, type EncounterBannerModel } from './encounter-banner';
import { HereNowCard } from './here-now';
import { HomeSetCard, PlaceRow } from './set-rows';

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
  readonly onOpenLegendaries: () => void;
  /** An encounter under way, with a way back into it. */
  readonly encounter?: EncounterBannerModel | null;
  /**
   * The person's own face at the end of the title line, opening their profile: the way to the
   * profile and Settings that works before they have a crew. Left out while no profile screen
   * is registered.
   */
  readonly profile?: DexProfileEntry | undefined;
}

type Item =
  | { readonly kind: 'group'; readonly key: string; readonly label: string }
  | { readonly kind: 'set'; readonly key: string; readonly set: SetModel };

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter },
  gap: { height: th.space['10'] },
}));

/** Place sets in rank groups of ten ("Rank 1–10 · five cities each"), unranked last. */
function withGroups(sets: readonly SetModel[], grouped: boolean): Item[] {
  const items: Item[] = [];
  let group = -1;
  for (const set of sets) {
    const g = set.rank === null ? Number.MAX_SAFE_INTEGER : Math.floor((set.rank - 1) / 10);
    if (grouped && g !== group && set.rank !== null) {
      group = g;
      const members = sets.filter((s) => s.rank !== null && Math.floor((s.rank - 1) / 10) === g);
      const sizes = new Set(members.map((s) => s.total));
      const [only] = [...sizes];
      items.push({
        kind: 'group',
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a list key, never copy.
        key: `group-${g}`,
        label: rankGroup(g * 10 + 1, g * 10 + 10, sizes.size === 1 ? (only ?? null) : null),
      });
    }
    items.push({ kind: 'set', key: set.id, set });
  }
  return items;
}

export interface DexProfileEntry {
  readonly name: string;
  /** The guide sticker worn as an avatar, when one was picked. */
  readonly guide: GuideAvatarId | null;
  /** The face the person wears (a photo, a guide), drawn in place of the guide or the initial. */
  readonly face?: { readonly photo?: { readonly uri: string }; readonly critter?: ReactNode };
  readonly onOpen: () => void;
}

const PROFILE_FACE = 32;

/** A 32 pt face with a full-size touch target around it, so the title line keeps its height. */
function ProfileEntry({ entry }: { readonly entry: DexProfileEntry }) {
  const guide = entry.guide === null ? null : GUIDE_STICKERS[entry.guide];
  return (
    <Pressable
      onPress={entry.onOpen}
      hitSlop={touchSlop(PROFILE_FACE, PROFILE_FACE)}
      accessibilityRole="button"
      accessibilityLabel={t({ id: 'critters.dex.openProfile', message: 'Your profile' })}
      testID="critters-dex-profile"
    >
      <Avatar
        name={entry.name}
        size="lg"
        decorative
        {...(entry.face !== undefined && (entry.face.photo ?? entry.face.critter) !== undefined
          ? entry.face
          : guide === null
            ? {}
            : { critter: <Sticker kind={guide.kind} name={guide.name} size={PROFILE_FACE - 6} /> })}
      />
    </Pressable>
  );
}

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
  const { model, filter, query } = props;
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
      {narrowed ? null : (
        <>
          {props.encounter == null ? null : <EncounterBanner banner={props.encounter} />}
          {props.egg === null ? null : (
            <EggCard
              egg={props.egg}
              onHatch={props.onHatch}
              onOpen={props.onOpenHatch}
              busy={props.hatching ?? false}
            />
          )}
          {model.hereNow === null ? null : (
            <HereNowCard here={model.hereNow} onOpen={props.onOpenCritter} />
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
              <HomeSetCard set={model.home} onOpen={props.onOpenSet} />
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
        data={items}
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
            <PlaceRow set={item.set} onOpen={props.onOpenSet} />
          )
        }
        testID="critters-dex-list"
      />
    </Scaffold>
  );
}
