/**
 * Rate the trip (3o-3): one card per place the trip visited, answered LOVED IT / FINE / SKIP IT
 * with an optional tip for the next crew. Each answer goes out with `rate_places` (offline queue
 * included) and the stack resumes where it was left. A tip moderation turned down says so gently;
 * the end card offers SHARE THE PLAN TOO.
 */
import type { RatingCard, PlaceVerdict } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCommand } from '@/data/commands/use-command';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { InfoPill } from '@/ui/chips/InfoPill';
import { TextField } from '@/ui/inputs/TextField';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { EmptyState } from '@/ui/states/EmptyState';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { dataOf, useRatingCards } from '../api';
import { ratePlaces, type RateVerdict } from '../commands';
import { communityRoutes } from '../routes';
import { rejectedTips, resumeIndex, TIP_LIMIT, verdictFor, withAnswers } from './rate-model';

const useStyles = makeStyles((th) => ({
  content: { paddingHorizontal: th.size.gutter, gap: th.space['16'] },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  choices: { flexDirection: 'row', gap: th.space['8'] },
  choice: { flex: 1 },
}));

export function RateTripScreen({ tripId }: { tripId: string }) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state, reload } = useRatingCards(tripId);
  const data = dataOf(state);
  const [answers, setAnswers] = useState<ReadonlyMap<string, RateVerdict>>(new Map());
  const cards = useMemo(() => withAnswers(data?.cards ?? [], answers), [data, answers]);
  const [index, setIndex] = useState<number | null>(null);
  const [tip, setTip] = useState('');
  const { send } = useCommand(ratePlaces);
  const guide = guideSticker(null);

  // Until she answers, the stack sits at the first place without a verdict.
  const at = index ?? (data === null ? 0 : resumeIndex(data.cards));
  const current: RatingCard | undefined = cards[at];
  const answer = (verdict: PlaceVerdict) => {
    if (current === undefined) return;
    const item = verdictFor(current, verdict, tip);
    setAnswers((previous) => new Map(previous).set(current.poi_id, item));
    void send({ trip_id: tripId, verdicts: [item] });
    setTip('');
    setIndex(at + 1);
  };
  const place = data?.destination_name ?? '';
  const turnedDown = rejectedTips(cards);

  return (
    <Scaffold testID="rate-trip">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: theme.space['12'], paddingBottom: insets.bottom + theme.space['24'] },
        ]}
      >
        <View style={styles.head}>
          <BackEyebrow label={t({ id: 'community.back.recap', message: 'Recap' })} />
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
                    {current.name.toUpperCase()}
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
                answer(event.nativeEvent.actionName as PlaceVerdict)
              }
            >
              <View style={styles.choice}>
                <PillButton
                  variant="secondary"
                  block
                  size="sm"
                  label={t({ id: 'community.rate.loved', message: 'Loved it' })}
                  onPress={() => answer('loved')}
                  testID="rate-loved"
                />
              </View>
              <View style={styles.choice}>
                <PillButton
                  variant="secondary"
                  block
                  size="sm"
                  label={t({ id: 'community.rate.fine', message: 'Fine' })}
                  onPress={() => answer('fine')}
                  testID="rate-fine"
                />
              </View>
              <View style={styles.choice}>
                <PillButton
                  variant="secondary"
                  block
                  size="sm"
                  label={t({ id: 'community.rate.skip', message: 'Skip it' })}
                  onPress={() => answer('skip')}
                  testID="rate-skip"
                />
              </View>
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
              {t({
                id: 'community.rate.done',
                message: `All rated. Your tips are live for crews planning ${place}.`,
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
        <Row gap="8">
          <View style={styles.choice}>
            <PillButton
              variant="secondary"
              block
              label={t({ id: 'community.rate.share', message: 'Share the plan too' })}
              onPress={() => router.push(communityRoutes.publish(tripId))}
              testID="rate-share-plan"
            />
          </View>
        </Row>
      </ScrollView>
    </Scaffold>
  );
}
