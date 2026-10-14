/**
 * A destination's guide page (4.04): the hero in the guide's colour with clear-glass back and ♥,
 * "Guide: Pon", the name, the guide's tagline and the guide waving; the year's crowds and the best
 * month (a month taps open its prices); the guide's first-timer picks; the crews' plans; and the
 * foot: Pitch to the crew (or pick a crew) and Plan it solo (4.07). States and words come from
 * the destination screen's container.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  Card,
  CritterSticker,
  GlassIconButton,
  GuideNote,
  Icon,
  ListCard,
  Skeleton,
  OfflinePill,
  PressableScale,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { SCROLL_EDGE_FADE, ScrollEdgeFade } from '@/ui/premium/shell';
import { SoloPassSheet } from '@/features/vote';

import type { DestinationViewProps } from '../../screens/destination-view-props';
import { Doodle } from '../components/doodle';
import { MonthCard } from './month-card';
import { PicksCarousel } from './picks-carousel';

const HERO = 320;
/* eslint-disable-next-line lingui/no-unlocalized-strings -- a style value, never copy. */
const GUIDE_TILT = '-6deg';

/** The dock: the 56 pt button, a 4 pt gap and the 44 pt text button under it. */
const DOCK_HEIGHT = 104;
export function PremiumDestinationView(props: DestinationViewProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const { hero, months, actions } = props;
  const guide = hero.guide;
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.ground }} testID="explore-destination">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <View
          style={{
            height: HERO,
            backgroundColor: guide.colour,
            paddingTop: insets.top + 64,
            paddingHorizontal: theme.space.titleGutter,
            overflow: 'hidden',
          }}
        >
          <Text variant="badge" color={theme.color.onAccent}>
            {t({
              id: 'explore.premium.dest.guide',
              message: `Guide: ${guide.name}`,
            }).toLocaleUpperCase()}
          </Text>
          <Text
            variant="hero"
            color={theme.color.onAccent}
            numberOfLines={2}
            adjustsFontSizeToFit
            style={{ maxWidth: '62%' }}
            testID="explore-dest-name"
          >
            {hero.name}
          </Text>
          <Text variant="rowText" color={theme.color.onAccent} style={{ maxWidth: '52%' }}>
            {hero.tagline}
          </Text>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: 8,
              top: insets.top + 60,
              transform: [{ rotate: GUIDE_TILT }],
            }}
          >
            <CritterSticker kind={guide.kind} name={guide.name} size={150} />
          </View>
        </View>
        <View
          style={{
            paddingHorizontal: theme.space.gap16,
            paddingTop: theme.space.gap16,
            gap: theme.space.gap16,
          }}
        >
          {props.offline ? <OfflinePill testID="explore-offline" /> : null}
          {hero.chips.length === 0 ? null : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap6 }}>
              {hero.chips.map((chip) => (
                <View
                  key={chip.text}
                  style={{
                    height: 26,
                    borderRadius: 13,
                    paddingHorizontal: theme.space.gap10,
                    justifyContent: 'center',
                    backgroundColor: theme.color.control,
                  }}
                >
                  <Text variant="badge" numberOfLines={1}>
                    {chip.text}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {props.loading ? (
            // The month card and the picks hold their places while the guide loads, so the page
            // keeps the design's shape instead of one line over an empty band.
            <View
              style={{ gap: theme.space.gap16 }}
              accessible
              accessibilityLabel={t({ id: 'explore.dest.loading', message: 'Loading the guide' })}
              testID="explore-dest-loading"
            >
              <Skeleton height={112} tone="block" radius={theme.radius.card} />
              <Skeleton width="55%" height={14} />
              <View style={{ flexDirection: 'row', gap: theme.space.gap10, overflow: 'hidden' }}>
                <Skeleton width={150} height={120} tone="soft" radius={theme.radius.card} />
                <Skeleton width={150} height={120} tone="soft" radius={theme.radius.card} />
                <Skeleton width={150} height={120} tone="soft" radius={theme.radius.card} />
              </View>
            </View>
          ) : null}
          {months === null ? null : <MonthCard months={months} accent={guide.colour} />}
          <PicksCarousel
            title={t({ id: 'explore.picks.title', message: `${guide.name}'s first-timer picks` })}
            picks={props.picks}
            onOpenPick={props.onOpenPick}
            onMap={props.onMap}
          />
          {props.onCrewPlans === undefined ? null : (
            <ListCard>
              <PressableScale
                onPress={props.onCrewPlans}
                accessibilityRole="button"
                testID="explore-crew-plans"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space.gap12,
                  padding: theme.space.gap12,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10.8,
                    backgroundColor: theme.color.status.tangerine.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Doodle name="ticket" size={30} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="rowTitle">
                    {t({ id: 'explore.premium.find.crewPlans', message: 'Crew plans' })}
                  </Text>
                  <Text variant="captionMuted" tone="muted">
                    {t({
                      id: 'explore.premium.find.crewPlansLine',
                      message: `How other crews did ${hero.name}`,
                    })}
                  </Text>
                </View>
                <Icon name="forward" size={16} color={theme.color.placeholder} />
              </PressableScale>
            </ListCard>
          )}
          {props.notice === null ? null : (
            <GuideNote
              name={guide.name}
              critter={guide.kind}
              text={
                props.notice === 'writing'
                  ? t({
                      id: 'explore.dest.writing',
                      message: `${guide.name} is still writing up ${hero.name}: the month-by-month crowds land here. The places are already on the map.`,
                    })
                  : props.notice === 'unavailable'
                    ? t({
                        id: 'explore.dest.unavailable',
                        message: `${guide.name}'s notes on ${hero.name} didn't load. They'll show up once this phone is back online.`,
                      })
                    : t({
                        id: 'explore.limited.body',
                        message: `No guide lives in ${hero.name} yet, so the month-by-month crowds aren't written. Flights, money and the best months are covered, and ${guide.name} plans the trip all the same.`,
                      })
              }
              testID="explore-dest-notice"
            />
          )}
          {actions.mode === 'crews' ? (
            <Card padded testID="explore-crew-picker">
              <Text variant="label" tone="muted">
                {t({ id: 'explore.premium.dest.whichCrew', message: `Pitch ${hero.name} to` })}
              </Text>
              {actions.crews.map((crew) => (
                <PressableScale
                  key={crew.id}
                  onPress={() => actions.onPickCrew(crew.id)}
                  accessibilityRole="button"
                  testID={`explore-crew-${crew.id}`}
                  style={{ paddingVertical: theme.space.gap10 }}
                >
                  <Text variant="rowTitle">{crew.name}</Text>
                </PressableScale>
              ))}
            </Card>
          ) : null}
        </View>
      </ScrollView>
      <ScrollEdgeFade
        edge="bottom"
        height={insets.bottom + theme.space.gap8 + DOCK_HEIGHT + SCROLL_EDGE_FADE}
        solid={insets.bottom + theme.space.gap8 + DOCK_HEIGHT / 2}
      />
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top + theme.space.gap4,
          left: 0,
          right: 0,
          paddingHorizontal: theme.space.gutter,
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <GlassIconButton
          icon="back"
          kind="clear"
          label={hero.backLabel}
          onPress={hero.onBack}
          testID="explore-back"
        />
        {hero.onToggleSave === undefined ? null : (
          <GlassIconButton
            icon="heart"
            kind="clear"
            label={
              hero.saved === true
                ? t({ id: 'explore.premium.dest.saved', message: 'Saved. Tap to remove' })
                : t({ id: 'explore.premium.dest.save', message: 'Save' })
            }
            onPress={hero.onToggleSave}
            testID="explore-save"
          />
        )}
      </View>
      <View
        style={{
          position: 'absolute',
          zIndex: 2,
          left: theme.space.titleGutter,
          right: theme.space.titleGutter,
          bottom: insets.bottom + theme.space.gap8,
          gap: theme.space.gap4,
          alignItems: 'center',
        }}
      >
        <View style={{ alignSelf: 'stretch' }}>
          <Button
            label={t({ id: 'vote.guest.pitch', message: 'Pitch to the crew' })}
            onPress={actions.onPitch}
            disabled={actions.mode === 'crews'}
            testID="explore-pitch"
          />
        </View>
        {/* The text button hugs its label; the wrapper centres it under the pill. */}
        <View style={{ alignSelf: 'center' }}>
          <TextButton
            align="center"
            label={t({ id: 'explore.premium.dest.solo', message: 'Plan it solo' })}
            onPress={actions.onSolo}
            testID="explore-solo"
          />
        </View>
      </View>
      {actions.mode === 'solo' ? (
        <SoloPassSheet
          placeName={hero.name}
          guide={{ kind: guide.kind, name: guide.name }}
          busy={actions.soloBusy}
          onStart={actions.onConfirmSolo}
          onClose={actions.onCancel}
        />
      ) : null}
    </View>
  );
}
