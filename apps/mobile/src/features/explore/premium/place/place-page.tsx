/**
 * A place (4.36, 4.37): the photo to the top edge under clear-glass back, share and ♥, then the
 * ground sheet over it: its kind and who saved it, its name and how far it is from the stay, the
 * fact tiles, when it fits (with the day's hour bars), the guide's tip, Know before you go, Next
 * nearby and If you like this. The dock keeps Add (at the slot it names) and the guide in reach.
 * Every tap and read comes from `usePlaceDetail`, shared with the current look.
 */
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  CritterSticker,
  GlassIconButton,
  GuideNote,
  ListCard,
  PressableScale,
  StatusTag,
  Text,
  usePremiumTheme,
} from '@/ui/premium';

import { PlacePhoto } from '../../components/place-hero-photo';
import { dayTitle } from '../../place-detail/model';
import { usePlaceDetail, type PlaceDetailInput } from '../../place-detail/use-place-detail';
import { placeIcon } from '../../search/place-icons';
import { kindWord } from '../../search/search-rows';
import { SectionLabel } from '../components/labels';
import { PlaceResultRow } from '../components/place-result-row';
import { FactTilesRow, KnowBeforeCard, NearbyRow, WhenItFitsCard } from './place-sections';

const HERO = 330;
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
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.ground }} testID="place-detail">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        <View style={{ height: HERO, overflow: 'hidden' }}>
          <PlacePhoto
            photo={view.photo}
            heroUrl={view.heroUrl}
            heroCredit={view.heroCredit}
            category={view.category}
            accent={view.guide.colour}
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
        </View>
      </ScrollView>
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
      <View
        style={[
          styles.dock,
          {
            bottom: insets.bottom + theme.space.gap12,
            paddingHorizontal: theme.space.gap16,
            gap: theme.space.gap10,
          },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Button
            label={view.cta.label}
            onPress={view.cta.onPress}
            disabled={view.cta.disabled}
            loading={view.cta.busy}
            testID="place-detail-cta"
          />
        </View>
        {view.onChat === undefined ? null : (
          <PressableScale
            onPress={view.onChat}
            accessibilityRole="button"
            accessibilityLabel={t({
              id: 'explore.premium.place.ask',
              message: `Ask ${guide.name}`,
            })}
            testID="place-detail-chat"
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: theme.color.status.maybe.bg,
              alignItems: 'center',
              justifyContent: 'flex-end',
              overflow: 'hidden',
              boxShadow: theme.shadow.raised,
            }}
          >
            <CritterSticker kind={guide.kind} name={guide.name} size={40} edge={false} />
          </PressableScale>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dock: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
});
