/**
 * Day trips from the stop (4.49): a line on what a day trip is, then each place a day out with its
 * length, how you get there each way, and either the day it is already on or "Put on a day"; a
 * card (or Put on a day) opens its area page, where it is added as a day trip. The guide's dock
 * says each one brings its own map and places.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTripAreas } from '@/data/areas/use-trip-areas';
import {
  Button,
  Card,
  EmptyState,
  PressableScale,
  StatusTag,
  Text,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { usePlanGuide } from '../../../plan/plan-guide';
import * as copy from '../../day-trips/copy';
import { dayTripsSection } from '../../day-trips/day-trips-model';
import { dayTripLinks } from '../../day-trips/links';
import { GuideDock } from '../components/guide-dock';
import { PlaceThumb } from '../components/place-thumb';

export function DayTripsScreen({ tripId }: { readonly tripId: string }) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const areas = useTripAreas(tripId);
  const guide = usePlanGuide();
  const section = dayTripsSection(areas);
  const critter = guide.kind;
  const title = section === null ? copy.backLabel() : copy.sectionTitle(section.city);
  const open = (id: string) => router.push(dayTripLinks.area(tripId, id));
  return (
    <PushScreen
      title={title}
      backLabel={t({ id: 'explore.premium.back', message: 'Back' })}
      testID="day-trips"
    >
      <View
        style={{
          paddingHorizontal: theme.space.gap16,
          paddingTop: theme.space.gap8,
          paddingBottom: insets.bottom + theme.space.gap16,
          gap: theme.space.gap10,
        }}
      >
        {section === null ? (
          areas.loaded ? (
            <EmptyState
              title={t({ id: 'explore.premium.dayTrips.none', message: 'No day trips from here' })}
              line={t({
                id: 'explore.premium.dayTrips.noneLine',
                message: 'This stop has no day trips yet. The places nearby are in Find.',
              })}
              check={false}
              testID="day-trips-empty"
            />
          ) : null
        ) : (
          <>
            <Text
              variant="body"
              tone="muted"
              style={{ paddingHorizontal: theme.space.gap8, marginBottom: theme.space.gap6 }}
            >
              {copy.tagline(section.city)}
            </Text>
            {section.cards.map((card) => (
              <PressableScale
                key={card.id}
                onPress={() => open(card.id)}
                accessibilityRole="button"
                accessibilityLabel={`${card.name}. ${card.travel}`}
                testID={`day-trip-${card.id}`}
              >
                <Card
                  style={{
                    flexDirection: 'row',
                    gap: theme.space.gap12,
                    padding: theme.space.gap10,
                  }}
                >
                  <PlaceThumb icon="boat" size={84} radius={14} />
                  <View style={{ flex: 1, gap: theme.space.gap4, justifyContent: 'center' }}>
                    {card.length === null ? null : (
                      <View style={{ alignSelf: 'flex-start' }}>
                        <StatusTag tone="maybe" label={copy.lengthTag(card.length)} />
                      </View>
                    )}
                    <Text variant="headline" numberOfLines={1}>
                      {card.name}
                    </Text>
                    <Text variant="captionMuted" tone="muted" numberOfLines={2}>
                      {card.travel}
                    </Text>
                    <View style={{ flexDirection: 'row', marginTop: theme.space.gap4 }}>
                      {card.dayNo === null ? (
                        <Button
                          label={t({ id: 'explore.premium.dayTrips.put', message: 'Put on a day' })}
                          size="small"
                          variant="control"
                          onPress={() => open(card.id)}
                          testID={`day-trip-put-${card.id}`}
                        />
                      ) : (
                        <StatusTag tone="booked" label={copy.onDayTag(card.dayNo)} />
                      )}
                    </View>
                  </View>
                </Card>
              </PressableScale>
            ))}
            <View style={{ marginTop: theme.space.gap8 }}>
              <GuideDock
                guideName={guide.name}
                critter={critter}
                text={t({
                  id: 'explore.premium.dayTrips.dock',
                  message: 'Each one brings its own map and places, and downloads with the trip.',
                })}
              />
            </View>
            <Text variant="caption" tone="muted" align="center">
              {copy.sourcesLine()}
            </Text>
          </>
        )}
      </View>
    </PushScreen>
  );
}
