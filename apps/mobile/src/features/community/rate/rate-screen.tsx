/**
 * Rate the trip (3o-3): one card per place the trip visited, answered LOVED IT / FINE / SKIP IT
 * with an optional tip for the next crew. The card stays after the verdict so the tip goes with
 * the place it is about; NEXT sends both with `rate_places` (offline queue included) and BACK ONE
 * reopens the last answer to correct it. The stack resumes where it was left. A tip moderation turned down says so gently;
 * the end card offers SHARE THE PLAN TOO.
 */
import type { PlaceVerdict } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Card } from '@/ui/cards/Card';
import { InfoPill } from '@/ui/chips/InfoPill';
import { TextField } from '@/ui/inputs/TextField';
import { KeyboardFooter } from '@/ui/layout/KeyboardFooter';
import { KeyboardScrollView } from '@/ui/layout/KeyboardScrollView';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { EmptyState } from '@/ui/states/EmptyState';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { communityRoutes } from '../routes';
import { TIP_LIMIT } from './rate-model';
import { useRateTrip } from './use-rate-trip';

const useStyles = makeStyles((th) => ({
  content: { paddingHorizontal: th.size.gutter, gap: th.space['16'] },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  choices: { flexDirection: 'row', gap: th.space['8'] },
  choice: { flex: 1 },
  center: { alignItems: 'center' },
}));

export function RateTripScreen({ tripId }: { tripId: string }) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const router = useRouter();
  const {
    state,
    reload,
    data,
    cards,
    at,
    current,
    picked,
    setPicked,
    tip,
    setTip,
    waiting,
    next,
    back,
    place,
    turnedDown,
  } = useRateTrip(tripId);
  const guide = guideSticker(null);

  return (
    <Scaffold edges={['top']} testID="rate-trip">
      <KeyboardScrollView
        contentContainerStyle={[styles.content, { paddingTop: theme.space['12'] }]}
      >
        <View style={styles.head}>
          <BackEyebrow label={t({ id: 'community.back.trip', message: 'Trip' })} />
          {cards.length === 0 || current === undefined ? null : (
            <Text variant="label" testID="rate-counter">
              {t({ id: 'community.rate.counter', message: `${at + 1} of ${cards.length}` })}
            </Text>
          )}
        </View>
        <Text variant="displayHero" accessibilityRole="header">
          {t({ id: 'community.rate.title', message: 'Rate the trip' })}
        </Text>
        <Text variant="body">
          {t({
            id: 'community.rate.intro',
            message: `One tap a place. Your tips show up for crews planning ${place}, and nothing else about you does.`,
          })}
        </Text>
        {state.status === 'loading' ? <Skeleton preset="card" /> : null}
        {state.status === 'missing' ? (
          <EmptyState
            guide="tokek"
            guideName={guide.name}
            title={t({ id: 'community.rate.offline', message: 'Rating needs a signal' })}
            line={t({
              id: 'community.rate.offlineLine',
              message: 'Open this from your trip when you are back online.',
            })}
            action={{ label: t({ id: 'community.retry', message: 'Try again' }), onPress: reload }}
            testID="rate-missing"
          />
        ) : null}
        {data !== null && cards.length === 0 ? (
          <EmptyState
            guide="tokek"
            guideName={guide.name}
            title={t({ id: 'community.rate.none', message: 'Nothing to rate yet' })}
            line={t({
              id: 'community.rate.noneLine',
              message: 'Places you visit on the trip show up here.',
            })}
            testID="rate-empty"
          />
        ) : null}
        {current === undefined ? null : (
          <Stack gap="12">
            <Card
              tone="raised"
              radius="cardBig"
              testID={`rate-card-${current.poi_id}`}
              accessibilityLabel={current.name}
            >
              <Stack gap="8">
                <View style={styles.head}>
                  <Text variant="h2" style={{ flex: 1 }}>
                    {current.name}
                  </Text>
                  {current.day_no === null ? null : (
                    <InfoPill>
                      {t({ id: 'community.rate.day', message: `Day ${current.day_no}` })}
                    </InfoPill>
                  )}
                </View>
              </Stack>
            </Card>
            <View
              style={styles.choices}
              accessible
              accessibilityActions={[
                { name: 'loved', label: t({ id: 'community.rate.loved', message: 'Loved it' }) },
                { name: 'fine', label: t({ id: 'community.rate.fine', message: 'Fine' }) },
                { name: 'skip', label: t({ id: 'community.rate.skip', message: 'Skip it' }) },
              ]}
              onAccessibilityAction={(event) =>
                setPicked(event.nativeEvent.actionName as PlaceVerdict)
              }
            >
              {(
                [
                  ['loved', t({ id: 'community.rate.loved', message: 'Loved it' })],
                  ['fine', t({ id: 'community.rate.fine', message: 'Fine' })],
                  ['skip', t({ id: 'community.rate.skip', message: 'Skip it' })],
                ] as const
              ).map(([verdict, label]) => (
                <View key={verdict} style={styles.choice}>
                  <PillButton
                    variant={picked === verdict ? 'primary' : 'secondary'}
                    block
                    size="sm"
                    label={label}
                    onPress={() => setPicked(verdict)}
                    testID={`rate-${verdict}`}
                  />
                </View>
              ))}
            </View>
            <TextField
              label={t({ id: 'community.rate.tipLabel', message: 'One tip for the next crew' })}
              value={tip}
              onChangeText={(text) => setTip(text.slice(0, TIP_LIMIT))}
              maxLines={3}
              testID="rate-tip"
            />
          </Stack>
        )}
        {data !== null && cards.length > 0 && current === undefined ? (
          <Card tone="green" radius="cardBig" testID="rate-done">
            <Text variant="h2">
              {waiting
                ? t({ id: 'community.rate.doneWaiting', message: 'All rated.' })
                : t({
                    id: 'community.rate.done',
                    message: `All rated. Your tips are live for crews planning ${place}.`,
                  })}
            </Text>
          </Card>
        ) : null}
        {waiting && current === undefined ? (
          <Card tone="raised" testID="rate-done-queued">
            <Text variant="body">
              {t({
                id: 'community.rate.doneQueued',
                message: 'Saved on your phone. They go up the moment you have signal.',
              })}
            </Text>
          </Card>
        ) : null}
        {turnedDown.map((card) => (
          <Text key={card.poi_id} variant="bodySm" testID={`rate-rejected-${card.poi_id}`}>
            {t({
              id: 'community.rate.rejected',
              message: `${card.name}: that tip didn't make it through. Try without names or numbers.`,
            })}
          </Text>
        ))}
      </KeyboardScrollView>
      <KeyboardFooter>
        {current === undefined ? (
          <PillButton
            variant="secondary"
            block
            label={t({ id: 'community.rate.share', message: 'Share the plan too' })}
            onPress={() => router.push(communityRoutes.publish(tripId))}
            testID="rate-share-plan"
          />
        ) : (
          <PillButton
            tone="yellow"
            block
            disabled={picked === null}
            label={t({ id: 'community.rate.next', message: 'Next' })}
            onPress={next}
            testID="rate-next"
          />
        )}
        {at > 0 && cards.length > 0 ? (
          <View style={styles.center}>
            <TextLink
              label={t({ id: 'community.rate.backOne', message: 'Back one' })}
              onPress={back}
              testID="rate-back-one"
            />
          </View>
        ) : null}
      </KeyboardFooter>
    </Scaffold>
  );
}
