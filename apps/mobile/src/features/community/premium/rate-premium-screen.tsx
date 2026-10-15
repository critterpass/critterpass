/**
 * Rate the trip, premium: pushed from the recap with the glass back. One card per place the trip
 * visited, answered Loved it / Fine / Skip it with an optional tip for the next crew; Next sends
 * both (offline queue included), Back one reopens the last answer to correct it, and the cards
 * cross-fade as the stack moves. The stack resumes where it was left; the end card offers Share
 * the plan too.
 */
import type { PlaceVerdict } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { guideSticker } from '@/ui/premium/stickers/guides';
import {
  Banner,
  Button,
  Card,
  CrossFade,
  EmptyState,
  Skeleton,
  StatusTag,
  Text,
  TextButton,
  TextField,
  usePremiumTheme,
} from '@/ui/premium';
import { KeyboardAwareScroll, KeyboardStickyFooter, PushScreen } from '@/ui/premium/shell';

import { TIP_LIMIT } from '../rate/rate-model';
import { useRateTrip } from '../rate/use-rate-trip';
import { communityRoutes } from '../routes';

const GECKO = guideSticker(null);

export function RatePremiumScreen({ tripId }: { readonly tripId: string }) {
  const th = usePremiumTheme();
  const [footerHeight, setFooterHeight] = useState(0);
  const { t } = useLingui();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const rate = useRateTrip(tripId);
  const { state, data, cards, at, current, picked, place } = rate;
  const choices: readonly (readonly [PlaceVerdict, string])[] = [
    ['loved', t({ id: 'community.rate.loved', message: 'Loved it' })],
    ['fine', t({ id: 'community.rate.fine', message: 'Fine' })],
    ['skip', t({ id: 'community.rate.skip', message: 'Skip it' })],
  ];
  const finished = data !== null && cards.length > 0 && current === undefined;

  return (
    <PushScreen
      title={t({ id: 'community.rate.title', message: 'Rate the trip' })}
      {...(cards.length === 0 || current === undefined
        ? {}
        : {
            subtitle: t({
              id: 'community.rate.counter',
              message: `${at + 1} of ${cards.length}`,
            }),
          })}
      backLabel={t({ id: 'community.back.trip', message: 'Trip' })}
      scroll={false}
      testID="rate-trip"
    >
      {/* The focused note stays clear of the docked footer above the keys. */}
      <KeyboardAwareScroll
        bottomOffset={footerHeight + th.space.gap16}
        contentContainerStyle={{
          paddingHorizontal: th.space.gutter,
          paddingBottom: th.space.gap16,
          gap: th.space.gap14,
        }}
      >
        <Text variant="body" tone="muted">
          {t({
            id: 'community.rate.intro',
            message: `One tap a place. Your tips show up for crews planning ${place}, and nothing else about you does.`,
          })}
        </Text>
        {state.status === 'loading' ? (
          <Skeleton height={160} tone="block" radius={th.radius.cardLarge} />
        ) : null}
        {state.status === 'missing' ? (
          <EmptyState
            critter={GECKO}
            check={false}
            title={t({ id: 'community.rate.offline', message: 'Rating needs a signal' })}
            line={t({
              id: 'community.rate.offlineLine',
              message: 'Open this from your trip when you are back online.',
            })}
            action={
              <Button
                label={t({ id: 'community.retry', message: 'Try again' })}
                variant="secondary"
                size="medium"
                onPress={rate.reload}
              />
            }
            testID="rate-missing"
          />
        ) : null}
        {data !== null && cards.length === 0 ? (
          <EmptyState
            critter={GECKO}
            title={t({ id: 'community.rate.none', message: 'Nothing to rate yet' })}
            line={t({
              id: 'community.rate.noneLine',
              message: 'Places you visit on the trip show up here.',
            })}
            testID="rate-empty"
          />
        ) : null}
        {current === undefined ? null : (
          <CrossFade swapKey={current.poi_id} style={{ gap: th.space.gap12 }}>
            <Card
              padded
              radius={th.radius.cardLarge}
              style={{ minHeight: 120, justifyContent: 'flex-end', gap: th.space.gap8 }}
              testID={`rate-card-${current.poi_id}`}
            >
              {current.day_no === null ? null : (
                <View style={{ alignSelf: 'flex-start' }}>
                  <StatusTag
                    tone="tangerine"
                    label={t({ id: 'community.rate.day', message: `Day ${current.day_no}` })}
                  />
                </View>
              )}
              <Text variant="title" accessibilityRole="header">
                {current.name}
              </Text>
            </Card>
            <View
              style={{ flexDirection: 'row', gap: th.space.gap8 }}
              accessible
              accessibilityActions={choices.map(([name, label]) => ({ name, label }))}
              onAccessibilityAction={(event) =>
                rate.setPicked(event.nativeEvent.actionName as PlaceVerdict)
              }
            >
              {choices.map(([verdict, label]) => (
                <View key={verdict} style={{ flex: 1 }}>
                  <Button
                    size="medium"
                    variant={picked === verdict ? 'primary' : 'control'}
                    label={label}
                    onPress={() => rate.setPicked(verdict)}
                    testID={`rate-${verdict}`}
                  />
                </View>
              ))}
            </View>
            <TextField
              accessibilityLabel={t({
                id: 'community.rate.tipLabel',
                message: 'One tip for the next crew',
              })}
              placeholder={t({
                id: 'community.rate.tipLabel',
                message: 'One tip for the next crew',
              })}
              value={rate.tip}
              onChangeText={(text) => rate.setTip(text.slice(0, TIP_LIMIT))}
              multiline
              maxLength={TIP_LIMIT}
              testID="rate-tip"
            />
          </CrossFade>
        )}
        {finished ? (
          <CrossFade swapKey="done">
            <View testID="rate-done">
              <EmptyState
                critter={GECKO}
                title={t({ id: 'community.rate.doneWaiting', message: 'All rated.' })}
                line={
                  rate.waiting
                    ? t({
                        id: 'community.rate.doneQueued',
                        message: 'Saved on your phone. They go up the moment you have signal.',
                      })
                    : t({
                        id: 'community.premium.rateLive',
                        message: `Your tips are live for crews planning ${place}.`,
                      })
                }
                {...(rate.waiting ? { testID: 'rate-done-queued' } : {})}
              />
            </View>
          </CrossFade>
        ) : null}
        {rate.turnedDown.map((card) => (
          <Banner
            key={card.poi_id}
            tone="error"
            text={t({
              id: 'community.rate.rejected',
              message: `${card.name}: that tip didn’t make it through. Try without names or numbers.`,
            })}
            testID={`rate-rejected-${card.poi_id}`}
          />
        ))}
      </KeyboardAwareScroll>
      <KeyboardStickyFooter>
        <View
          onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
          style={{
            paddingHorizontal: th.space.gutter,
            paddingTop: th.space.gap8,
            paddingBottom: Math.max(insets.bottom, th.space.gap12),
            gap: th.space.gap4,
          }}
        >
          {current === undefined ? (
            <Button
              variant="secondary"
              label={t({ id: 'community.rate.share', message: 'Share the plan too' })}
              onPress={() => router.push(communityRoutes.publish(tripId))}
              testID="rate-share-plan"
            />
          ) : (
            <Button
              disabled={picked === null}
              label={t({ id: 'community.rate.next', message: 'Next' })}
              onPress={rate.next}
              testID="rate-next"
            />
          )}
          {at > 0 && cards.length > 0 ? (
            <TextButton
              label={t({ id: 'community.rate.backOne', message: 'Back one' })}
              align="center"
              onPress={rate.back}
              testID="rate-back-one"
            />
          ) : null}
        </View>
      </KeyboardStickyFooter>
    </PushScreen>
  );
}
