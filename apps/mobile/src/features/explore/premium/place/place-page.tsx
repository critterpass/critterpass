/**
 * A place (4.36, 4.37): the photo to the top edge under clear-glass back, share and ♥, then the
 * ground sheet over it: its kind and who saved it, its name and how far it is from the stay, the
 * fact tiles, when it fits (with the day's hour bars), the guide's tip, Know before you go,
 * Tickets and tours (where the place sells them), Next nearby, If you like this and, under a summary
 * the guide wrote, Report a problem. A place the guide knows nothing about yet says so, with Ask.
 * The dock keeps Add (at the slot it names) and the guide's white circle in reach.
 * Every tap and read comes from `usePlaceDetail`.
 */
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  GuideNote,
  ListCard,
  PressableScale,
  StatusTag,
  Text,
  usePremiumTheme,
} from '@/ui/premium';
import {
  PhotoHeaderScrim,
  SCROLL_EDGE_FADE,
  ScrollEdgeFade,
  useScrollEdges,
} from '@/ui/premium/shell';

import { dayTitle } from '../../place-detail/model';
import { usePlaceDetail, type PlaceDetailInput } from '../../place-detail/use-place-detail';
import { placeIcon } from '../../search/place-icons';
import { kindWord } from '../../search/search-rows';
import { SectionLabel } from '../components/labels';
import { PlaceResultRow } from '../components/place-result-row';
import { FactTilesRow, KnowBeforeCard, NearbyRow, WhenItFitsCard } from './place-sections';
import { PlaceOffersCard, ReportPlaceProfile } from './place-extras';
import { PlaceDock } from './place-dock';
import { PlaceHeroPhoto } from './place-hero-photo';
import { PremiumRemoveForEveryone } from './remove-for-everyone';

/**
 * The drawn hero's height (4.36): the sheet starts just over a third down, so the page's next
 * section heading clears the dock at rest instead of sitting half under it.
 */
const HERO = 306;
const OVERLAP = 34;

export function PlacePage(props: PlaceDetailInput) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { i18n } = useLingui();
  const { view, further } = usePlaceDetail(props);
  const kind = kindWord(view.category);
  const fits = view.fits;
  const similar = further.context?.similar[0];
  const addHref = (poiId: string) => {
    const href = further.addPlace(poiId);
    return href === undefined ? undefined : () => router.push(href);
  };
  const guide = { kind: view.guide.kind, name: view.guide.name };
  // A place the guide has nothing on yet (no facts, timing, tips, notes, offers or neighbours):
  // the page says so and offers to ask, rather than leaving Report a problem as its only line.
  const sparse =
    !further.loading &&
    view.facts === null &&
    fits === null &&
    further.tip === null &&
    (further.context?.know.length ?? 0) === 0 &&
    further.offers === null &&
    (further.context?.nearby.length ?? 0) === 0 &&
    similar === undefined;
  // The glass circles' band, and the dock's: the page fades into the ground under each, the top
  // one only once the photo has scrolled out from under the circles.
  const headerBand = insets.top + theme.space.gap4 + theme.size.glassNav;
  const dockBand = insets.bottom + theme.space.gap12 + theme.size.button;
  const edges = useScrollEdges({ topAfter: HERO - OVERLAP - headerBand });
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.ground }} testID="place-detail">
      <ScrollView
        {...edges.scrollProps}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
      >
        <View style={{ height: HERO, overflow: 'hidden' }}>
          <PlaceHeroPhoto
            photo={view.photo}
            heroUrl={view.heroUrl}
            heroCredit={view.heroCredit}
            category={view.category}
            captionInset={OVERLAP + theme.space.gap8}
          />
        </View>
        <View
          style={{
            marginTop: -OVERLAP,
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            backgroundColor: theme.color.ground,
            paddingHorizontal: theme.space.gutter,
            paddingTop: theme.space.gutter,
            gap: theme.space.gap12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap6 }}>
            {kind === null ? null : <StatusTag tone="tangerine" label={kind} />}
            {view.split === null ? null : (
              <PressableScale onPress={view.split.onPress} accessibilityRole="button">
                <StatusTag tone="voteOpen" label={view.split.label} />
              </PressableScale>
            )}
            {view.savedBy === null ? null : (
              <Text
                variant="captionMuted"
                tone="inkSecondary"
                numberOfLines={1}
                style={{ flex: 1 }}
              >
                {view.savedBy}
              </Text>
            )}
          </View>
          <View>
            <Text variant="display" accessibilityRole="header">
              {view.name}
            </Text>
            {view.meta.length === 0 ? null : (
              <Text variant="label" tone="muted">
                {view.meta.join(' · ')}
              </Text>
            )}
          </View>
          {view.facts === null ? null : <FactTilesRow facts={view.facts} />}
          {fits === null ? null : (
            <WhenItFitsCard
              guide={guide}
              eyebrow={
                fits.planned === null || fits.planned === undefined
                  ? t({ id: 'explore.detail.fits.eyebrow', message: 'When it fits' })
                  : t({ id: 'explore.detail.fits.inPlan', message: 'In the plan' })
              }
              value={
                fits.planned === null || fits.planned === undefined
                  ? t({
                      id: 'explore.premium.place.fitsAt',
                      message: `${dayTitle(fits.best.date, i18n.locale)} at ${fits.best.start}`,
                    })
                  : dayTitle(fits.planned.date, i18n.locale)
              }
              sentence={fits.sentence}
              bars={fits.bars}
              onOtherDays={fits.onOtherDays}
            />
          )}
          {view.fitNote === null ? null : (
            <Text variant="note" tone="muted">
              {view.fitNote}
            </Text>
          )}
          {further.tip === null ? null : (
            <GuideNote
              name={view.guide.name}
              critter={view.guide.kind}
              text={further.tip}
              testID="place-detail-tip"
            />
          )}
          <KnowBeforeCard lines={further.context?.know ?? []} />
          {further.offers === null ? null : <PlaceOffersCard {...further.offers} />}
          <PremiumRemoveForEveryone
            tripId={props.tripId ?? null}
            placeId={further.placeId}
            name={further.name}
            organiser={further.organiser}
          />
          <NearbyRow
            places={further.context?.nearby ?? []}
            onPlace={further.onPlace}
            onAdd={
              similar === undefined || further.addPlace(similar.poi_id) === undefined
                ? undefined
                : (poiId) => addHref(poiId)?.()
            }
          />
          {similar === undefined ? null : (
            <View style={{ gap: theme.space.gap8 }} testID="place-detail-similar">
              <SectionLabel>
                {t({ id: 'explore.premium.place.ifYouLike', message: 'If you like this' })}
              </SectionLabel>
              <ListCard>
                <PlaceResultRow
                  title={similar.name}
                  meta={kindWord(similar.category) ?? undefined}
                  icon={placeIcon(similar.category)}
                  onPress={() => further.onPlace(similar.poi_id)}
                  {...(addHref(similar.poi_id) === undefined
                    ? {}
                    : {
                        onAdd: addHref(similar.poi_id),
                        addLabel: t({
                          id: 'search.premium.row.add',
                          message: `Add ${similar.name}`,
                        }),
                      })}
                />
              </ListCard>
            </View>
          )}
          {sparse ? (
            <GuideNote
              name={view.guide.name}
              critter={view.guide.kind}
              text={t({
                id: 'explore.premium.place.sparse',
                message: `Nothing written up about this place yet. Ask ${view.guide.name} for its hours, prices and the best time to go.`,
              })}
              {...(view.onChat === undefined
                ? {}
                : {
                    action: {
                      label: t({ id: 'explore.premium.place.sparseAsk', message: 'Ask' }),
                      onPress: view.onChat,
                    },
                  })}
              testID="place-detail-sparse"
            />
          ) : null}
          {further.profile === null ? null : <ReportPlaceProfile poiId={further.placeId} />}
        </View>
      </ScrollView>
      {edges.top ? null : <PhotoHeaderScrim height={headerBand + SCROLL_EDGE_FADE} />}
      <ScrollEdgeFade
        edge="top"
        height={headerBand + SCROLL_EDGE_FADE}
        solid={headerBand}
        visible={edges.top}
      />
      <ScrollEdgeFade
        edge="bottom"
        height={dockBand + SCROLL_EDGE_FADE}
        // Opaque behind the whole dock: content never reads half under the button.
        solid={dockBand}
        visible={edges.bottom}
      />
      <View
        pointerEvents="box-none"
        style={[
          styles.header,
          { top: insets.top + theme.space.gap4, paddingHorizontal: theme.space.gutter },
        ]}
      >
        <GlassIconButton
          icon="back"
          kind="clear"
          label={t({ id: 'explore.premium.back', message: 'Back' })}
          onPress={view.onBack}
          testID="place-detail-back"
        />
        <View style={{ flexDirection: 'row', gap: theme.space.gap8 }}>
          <GlassIconButton
            icon="share"
            kind="clear"
            label={t({ id: 'explore.premium.detail.share', message: 'Share' })}
            onPress={view.onShare}
            testID="place-detail-share"
          />
          <GlassIconButton
            icon="heart"
            kind="clear"
            label={
              view.saved
                ? t({ id: 'explore.premium.detail.unsave', message: 'Saved. Tap to remove' })
                : t({ id: 'explore.premium.detail.save', message: 'Save' })
            }
            onPress={view.onToggleSave}
            testID="place-detail-save"
          />
        </View>
      </View>
      <PlaceDock
        cta={view.cta}
        guide={guide}
        onChat={view.onChat}
        bottom={insets.bottom + theme.space.gap12}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    zIndex: 2,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
