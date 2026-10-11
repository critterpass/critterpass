/**
 * Ideas (4.40), a sheet over the plan map: "Ideas · 9" with On map, the must-do banner (star one
 * each; how many have), every saved place with its fit line, its savers and a star (yours fills
 * gold, someone else's says whose), and "Place them for me". A row opens the place; a long press
 * offers Add to a day and the ways to remove it (with Undo). Before the crew has a plan a member
 * reads that it is still being put together.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  CrewStack,
  EmptyState,
  ListCard,
  PressableScale,
  Text,
  usePremiumTheme,
} from '@/ui/premium';

import { fitColour, PlaceThumb } from '@/features/explore';
import { crewColour } from '@/features/vote';
import { ideaIcon } from '../../ideas/idea-icon';
import {
  beforePlanBody,
  bodyText,
  draftBodyText,
  emptyLine,
  findPlacesLabel,
  placeLine,
} from '../../ideas/ideas-copy';
import { useIdeasModel } from '../../ideas/use-ideas-model';
import { useMustDoStars } from '../../ideas/use-must-do-stars';
import { GlassMenu } from '../plan-map/glass-menu';

const STAR = 36;
const STARRED = '★';
const UNSTARRED = '☆';

export function IdeasSheet({ tripId }: { readonly tripId: string }) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const model = useIdeasModel(tripId);
  const { saved, ideas, placeable, summary, photos, names, namer, guideName } = model;
  const { plan, loaded, beforePlan } = saved;
  const stars = useMustDoStars(tripId, plan.uid);
  const [menu, setMenu] = useState<{ readonly id: string; readonly y: number } | null>(null);
  const open = menu === null ? null : (ideas.find((idea) => idea.id === menu.id) ?? null);
  const total = plan.members.length;
  const body =
    beforePlan !== null
      ? beforePlanBody(ideas.length, beforePlan.organiser)
      : saved.crewPlan
        ? bodyText(ideas.length, guideName)
        : draftBodyText(ideas.length);

  return (
    <View style={{ flex: 1 }} testID="ideas-sheet">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.space.gap16,
          paddingTop: theme.space.gap16,
          paddingBottom: insets.bottom + theme.space.gap16,
          gap: theme.space.gap12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap12 }}>
          <View style={{ flex: 1 }}>
            <Text variant="title" accessibilityRole="header">
              {t({ id: 'plan.premium.ideas.title', message: `Ideas · ${ideas.length}` })}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={2}>
              {ideas.length === 0
                ? t({ id: 'plan.premium.ideas.emptySub', message: 'Nothing saved yet' })
                : body}
            </Text>
          </View>
          {model.mapHref === undefined ? null : (
            <Button
              label={t({ id: 'plan.premium.ideas.onMap', message: 'On map' })}
              size="small"
              variant="control"
              onPress={() => {
                if (model.mapHref !== undefined) router.push(model.mapHref);
              }}
              testID="ideas-on-map"
            />
          )}
        </View>
        {ideas.length === 0 ? null : (
          <View
            testID="ideas-must-do-banner"
            style={{
              borderRadius: 18,
              backgroundColor: theme.color.banner.guide.bg,
              paddingVertical: theme.space.gap10,
              paddingHorizontal: theme.space.gap12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space.gap10,
            }}
          >
            <Text variant="headline" color={theme.color.guideName}>
              {STARRED}
            </Text>
            <Text variant="note" color={theme.color.banner.guide.text} style={{ flex: 1 }}>
              <Text variant="bannerAction" color={theme.color.banner.guide.text}>
                {t({ id: 'plan.premium.ideas.mustDoLead', message: 'Must-dos: star one each.' })}
              </Text>
              {` ${t({
                id: 'plan.premium.ideas.starred',
                message: `${stars.starredCount} of ${total} starred`,
              })}`}
            </Text>
          </View>
        )}
        {loaded && ideas.length === 0 ? (
          <EmptyState
            title={t({ id: 'plan.premium.ideas.emptyTitle', message: 'Nothing saved yet' })}
            line={emptyLine()}
            check={false}
            action={
              model.searchHref === undefined ? undefined : (
                <Button
                  label={findPlacesLabel()}
                  onPress={() => {
                    if (model.searchHref !== undefined) router.push(model.searchHref);
                  }}
                />
              )
            }
            testID="ideas-empty"
          />
        ) : (
          <ListCard>
            {ideas.map((idea, index) => {
              const line = model.lineOf(idea);
              const poiId = idea.poiId;
              const starredBy = poiId === null ? [] : (stars.starredBy.get(poiId) ?? []);
              const mine = poiId !== null && stars.myStar === poiId;
              const other = starredBy.find((uid) => uid !== plan.uid);
              const otherName = other === undefined ? null : (names.get(other)?.name ?? null);
              const name = namer.name(idea);
              const savers = idea.backerIds.flatMap((uid) => {
                const member = names.get(uid);
                return member === undefined
                  ? []
                  : [{ id: uid, name: member.name, color: crewColour(member.joinIndex) }];
              });
              return (
                <PressableScale
                  key={idea.id}
                  onPress={() => model.openPlace(idea)}
                  onLongPress={() => setMenu({ id: idea.id, y: height / 3 })}
                  accessibilityRole="button"
                  accessibilityLabel={`${name}. ${line.text}`}
                  testID={`ideas-row-${String(index)}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.space.gap12,
                    paddingVertical: theme.space.gap8 + 1,
                    paddingHorizontal: theme.space.gap12,
                  }}
                >
                  <PlaceThumb
                    photo={poiId === null ? undefined : photos.get(poiId)?.tile.photo}
                    icon={ideaIcon(idea.category)}
                    size={44}
                  />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text variant="rowTitle" numberOfLines={1}>
                      {name}
                    </Text>
                    <Text
                      variant="captionMuted"
                      color={
                        otherName !== null ? theme.color.guideName : fitColour(theme, line.tone)
                      }
                      numberOfLines={1}
                    >
                      {otherName !== null
                        ? t({ id: 'plan.premium.ideas.theirs', message: `${otherName}’s must-do` })
                        : line.text}
                    </Text>
                    {savers.length === 0 ? null : (
                      <CrewStack
                        members={savers}
                        size={20}
                        max={4}
                        accessibilityLabel={savers.map((saver) => saver.name).join(', ')}
                      />
                    )}
                  </View>
                  {poiId === null ? null : (
                    <PressableScale
                      onPress={() => stars.star({ poiId, name })}
                      accessibilityRole="button"
                      accessibilityState={{ selected: mine }}
                      accessibilityLabel={
                        mine
                          ? t({ id: 'plan.premium.ideas.unstar', message: `Unstar ${name}` })
                          : t({
                              id: 'plan.premium.ideas.star',
                              message: `Star ${name} as your must-do`,
                            })
                      }
                      testID={`ideas-star-${String(index)}`}
                      style={{
                        width: STAR,
                        height: STAR,
                        borderRadius: STAR / 2,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: mine ? theme.color.status.maybe.bg : theme.color.ground,
                      }}
                    >
                      <Text
                        variant="headline"
                        color={mine ? theme.color.guideName : theme.color.placeholder}
                      >
                        {mine ? STARRED : UNSTARRED}
                      </Text>
                    </PressableScale>
                  )}
                </PressableScale>
              );
            })}
          </ListCard>
        )}
        {placeable.length === 0 || !saved.crewPlan ? null : (
          <View style={{ gap: theme.space.gap6, marginTop: theme.space.gap4 }}>
            <Text variant="caption" tone="muted" align="center">
              {placeLine(summary.fitting, summary.needCrew + summary.unknown)}
            </Text>
            <Button
              label={t({ id: 'plan.premium.ideas.place', message: 'Place them for me' })}
              onPress={() => void model.onPlace()}
              loading={model.starting}
              testID="ideas-place"
            />
          </View>
        )}
      </ScrollView>
      {open === null || menu === null ? null : (
        <GlassMenu
          anchor={{ x: 20, y: menu.y }}
          onClose={() => setMenu(null)}
          accessibilityLabel={t({ id: 'plan.premium.ideas.closeMenu', message: 'Close' })}
          testID="ideas-row-menu"
          items={[
            ...(beforePlan !== null
              ? []
              : [
                  {
                    key: 'add',
                    label: t({ id: 'plan.premium.ideas.addToDay', message: 'Add to a day' }),
                    icon: 'plus' as const,
                    onPress: () => model.openAdd(open.poiId ?? open.id),
                  },
                ]),
            ...(plan.uid !== null && open.backerIds.includes(plan.uid)
              ? [
                  {
                    key: 'mine',
                    label: t({ id: 'plan.premium.ideas.removeMine', message: 'Remove my save' }),
                    icon: 'minus' as const,
                    destructive: true,
                    onPress: () => model.onRemove(open, false),
                  },
                ]
              : []),
            ...(plan.organiser
              ? [
                  {
                    key: 'everyone',
                    label: t({
                      id: 'plan.premium.ideas.removeAll',
                      message: 'Remove for everyone',
                    }),
                    icon: 'close' as const,
                    destructive: true,
                    onPress: () => model.onRemove(open, true),
                  },
                ]
              : []),
          ]}
        />
      )}
    </View>
  );
}
