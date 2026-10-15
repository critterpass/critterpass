/**
 * A day trip's page (4.50's banner and 4.49's "Put on a day"): the place over its colour with the
 * glass back, the day-trip banner (how to get there each way, its length, about what it costs),
 * the guide's note, the places there as cards, the map for offline, and the foot: add it as a day
 * trip, or the day it is on with change and remove; a member reads who adds it. The shared
 * `AreaScreen` holds every read and command.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  CritterSticker,
  GlassIconButton,
  GuideNote,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { SCROLL_EDGE_FADE, ScrollEdgeFade } from '@/ui/premium/shell';

import type { AreaViewProps } from '../../day-trips/area-screen';
import * as copy from '../../day-trips/copy';
import { PicksCarousel } from '../destination/picks-carousel';
import { Doodle } from '../components/doodle';

const HERO = 240;

/** The dock: the 56 pt button, a 4 pt gap and the 44 pt text button under it. */
const DOCK_HEIGHT = 104;
export function PremiumAreaView(props: AreaViewProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const { hero, action } = props;
  const guide = hero.guide;
  const quiet = (line: string, testID: string) => (
    <Text variant="caption" tone="muted" align="center" testID={testID}>
      {line}
    </Text>
  );
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.ground }} testID="day-trip-area">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <View
          style={{
            height: HERO,
            backgroundColor: guide.colour,
            paddingTop: insets.top + 64,
            paddingHorizontal: theme.space.titleGutter,
          }}
        >
          <Text
            variant="hero"
            color={theme.color.onAccent}
            numberOfLines={2}
            adjustsFontSizeToFit
            style={{ maxWidth: '65%' }}
          >
            {hero.name}
          </Text>
          <Text variant="rowText" color={theme.color.onAccent} style={{ maxWidth: '55%' }}>
            {hero.tagline}
          </Text>
          <View pointerEvents="none" style={{ position: 'absolute', right: 10, bottom: 10 }}>
            <CritterSticker kind={guide.kind} name={guide.name} size={110} />
          </View>
        </View>
        <View style={{ padding: theme.space.gap16, gap: theme.space.gap12 }}>
          {props.travel === null && props.length === null ? null : (
            <View
              testID="day-trip-banner"
              style={{
                borderRadius: theme.radius.banner,
                backgroundColor: theme.color.status.maybe.bg,
                paddingVertical: theme.space.gap10,
                paddingHorizontal: theme.space.rowPadH,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.gap10,
              }}
            >
              <Doodle name="boat" size={34} />
              <View style={{ flex: 1 }}>
                <Text variant="badge" color={theme.color.status.maybe.text}>
                  {(
                    props.length ?? t({ id: 'explore.premium.area.dayTrip', message: 'Day trip' })
                  ).toLocaleUpperCase()}
                </Text>
                {props.travel === null ? null : (
                  <Text variant="rowTextStrong" color={theme.color.banner.guide.text}>
                    {props.travel}
                  </Text>
                )}
                {props.cost === null ? null : (
                  <Text variant="captionMuted" color={theme.color.banner.guide.text}>
                    {props.cost}
                  </Text>
                )}
              </View>
            </View>
          )}
          {props.note === null ? null : (
            <GuideNote name={guide.name} critter={guide.kind} text={props.note} />
          )}
          {props.placesComing ? (
            <Text variant="body" tone="muted">
              {copy.placesComing(guide.name)}
            </Text>
          ) : (
            <PicksCarousel
              title={copy.placesTitle(hero.name)}
              picks={props.picks}
              onOpenPick={props.onOpenPick}
              onMap={undefined}
            />
          )}
          {props.pack ?? null}
          <Text variant="captionMuted" tone="placeholder" align="center">
            {copy.sourcesLine()}
          </Text>
        </View>
      </ScrollView>
      <ScrollEdgeFade
        edge="bottom"
        height={insets.bottom + theme.space.gap8 + DOCK_HEIGHT + SCROLL_EDGE_FADE}
        // Opaque behind the whole dock: content never reads half under the button.
        solid={insets.bottom + theme.space.gap8 + DOCK_HEIGHT}
      />
      <View
        style={{
          position: 'absolute',
          top: insets.top + theme.space.gap4,
          left: theme.space.gutter,
        }}
      >
        <GlassIconButton
          icon="back"
          kind="clear"
          label={hero.backLabel}
          onPress={hero.onBack}
          testID="day-trip-back"
        />
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
        {action.kind === 'add' ? (
          <View style={{ alignSelf: 'stretch' }}>
            <Button label={copy.addAsDayTrip()} onPress={props.onAdd} testID="day-trip-add" />
          </View>
        ) : action.kind === 'offline' ? (
          <>
            <View style={{ alignSelf: 'stretch' }}>
              <Button
                label={copy.addAsDayTrip()}
                onPress={props.onAdd}
                disabled
                testID="day-trip-add"
              />
            </View>
            {quiet(copy.offlineLine(), 'day-trip-add-offline')}
          </>
        ) : action.kind === 'onDay' ? (
          <>
            <Text variant="rowTextStrong" align="center">
              {copy.onDayLine(action.dayNo, props.onDayDate)}
            </Text>
            {action.canChange ? (
              <View style={{ flexDirection: 'row', gap: theme.space.gap12 }}>
                <TextButton
                  label={copy.changeDay()}
                  onPress={props.onChangeDay}
                  testID="day-trip-change"
                />
                <TextButton
                  label={copy.remove()}
                  onPress={props.onRemove}
                  testID="day-trip-remove"
                />
              </View>
            ) : null}
          </>
        ) : action.kind === 'member' ? (
          quiet(copy.askOrganiser(action.organiser), 'day-trip-ask')
        ) : action.kind === 'drafting' ? (
          quiet(copy.draftingLine(guide.name), 'day-trip-drafting')
        ) : action.kind === 'noPlan' ? (
          quiet(copy.noPlanLine(), 'day-trip-no-plan')
        ) : (
          quiet(copy.closedLine(), 'day-trip-closed')
        )}
      </View>
    </View>
  );
}
