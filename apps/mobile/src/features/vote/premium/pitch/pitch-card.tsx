/**
 * The guide's pitch as it streams, in the premium look (undesigned; built from the card, sticker,
 * tags, crew stack and guide note): the sticker lands first, then the facts as tags, the
 * headline, why the crew might bite (with the faces each reason matches) and the guide's line,
 * each fading in as it arrives; skeletons hold the places still streaming, and a failed stream
 * offers a retry.
 */
import type { PitchChip } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { guideSticker } from '@/ui/avatar/guides';
import {
  Button,
  Card,
  CritterSticker,
  CrewStack,
  GuideNote,
  Skeleton,
  Tag,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { pitchShowsAiLabel, type PitchState } from '../../data/use-pitch-stream';
import type { Person } from '../../data/use-people';
import { FadeSection } from '../../board/fade-section';
import { flightHours, guideOr, money, monthShort } from '../../format';
import { crewOf } from '../components/crew';
import { popIn } from '../entrances';

function useChipText(): (chip: PitchChip) => string {
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  return (chip) => {
    switch (chip.kind) {
      case 'price':
        return t({
          id: 'vote.pitch.chipPrice',
          message: `${money(locale, chip.amount_minor, chip.currency)} each`,
        });
      case 'flight':
        return t({
          id: 'vote.pitch.chipFlight',
          message: `${flightHours(chip.minutes)}h from ${chip.origin}`,
        });
      case 'best_months':
        return t({
          id: 'vote.pitch.chipBest',
          message: `Best: ${chip.months.map((month) => monthShort(locale, month)).join(' · ')}`,
        });
      case 'event':
        return chip.name;
      case 'prices_pending':
        return t({ id: 'vote.pitch.chipPending', message: 'Prices pending' });
    }
  };
}

export function PremiumPitchCard(props: {
  readonly state: PitchState;
  readonly people: ReadonlyMap<string, Person>;
  readonly onRetry: () => void;
}) {
  const { state, people, onRetry } = props;
  const { t } = useLingui();
  const theme = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const chipText = useChipText();
  const guide = guideSticker(guideOr(state.sticker?.guide));
  const streaming = state.phase === 'streaming';
  const retry = (
    <Button
      label={t({ id: 'vote.pitch.retry', message: 'Try again' })}
      variant="secondary"
      size="small"
      onPress={onRetry}
      testID="pitch-retry"
    />
  );
  if (state.phase === 'error' && state.headline === null) {
    return (
      <Card testID="pitch-error">
        <View style={styles.stack}>
          <Text variant="headline">
            {t({ id: 'vote.pitch.errorTitle', message: "The pitch didn't come through" })}
          </Text>
          <Text variant="body" tone="muted">
            {t({ id: 'vote.pitch.errorBody', message: 'Check your connection and ask again.' })}
          </Text>
          <View style={styles.start}>{retry}</View>
        </View>
      </Card>
    );
  }
  const heading = state.sticker === null ? '' : (state.headline ?? state.sticker.name);
  return (
    <Card radius={theme.radius.cardLarge} testID="pitch-card">
      <View style={styles.stack}>
        <View style={styles.head}>
          {state.sticker === null ? (
            <Skeleton
              width={72}
              height={72}
              radius={theme.radius.round}
              tone="block"
              style={styles.sticker}
            />
          ) : (
            <Animated.View {...(reduced ? {} : { entering: popIn(false, 'lively') })}>
              <CritterSticker kind={guide.kind} name={guide.name} size={72} />
            </Animated.View>
          )}
          <View style={styles.titles}>
            <Text variant="captionMuted">
              {t({ id: 'vote.pitch.byline', message: `${guide.name} pitches` })}
            </Text>
            {state.headline === null && streaming ? (
              <Skeleton height={22} width="80%" />
            ) : (
              <FadeSection>
                <Text variant="title" numberOfLines={4} testID="pitch-headline">
                  {heading}
                </Text>
              </FadeSection>
            )}
          </View>
        </View>
        {state.chips.length > 0 ? (
          <FadeSection>
            <View style={styles.tags} testID="pitch-chips">
              {state.chips.map((chip, index) => (
                <Tag key={`${chip.kind}-${index}`} label={chipText(chip)} />
              ))}
            </View>
          </FadeSection>
        ) : null}
        {state.reasons.length > 0 ? (
          <FadeSection>
            <View style={styles.reasons} testID="pitch-reasons">
              <Text variant="label" tone="muted">
                {t({ id: 'vote.pitch.why', message: 'Why your crew might bite' })}
              </Text>
              {state.reasons.map((reason, index) => {
                const faces = crewOf(people, reason.member_ids);
                return (
                  <View key={index} style={styles.reason}>
                    <Text variant="rowText" style={styles.grow}>
                      {reason.text}
                    </Text>
                    {faces.length > 0 ? (
                      <CrewStack
                        members={faces}
                        max={3}
                        size={24}
                        accessibilityLabel={faces.map((face) => face.name).join(', ')}
                      />
                    ) : null}
                  </View>
                );
              })}
            </View>
          </FadeSection>
        ) : streaming ? (
          <Skeleton height={44} />
        ) : null}
        {state.quote === null ? null : (
          <FadeSection>
            <GuideNote name={guide.name} text={state.quote} testID="pitch-quote" />
          </FadeSection>
        )}
        {pitchShowsAiLabel(state) ? (
          <Text variant="caption" tone="muted" testID="pitch-ai-label">
            {t({ id: 'vote.pitch.ai', message: 'Written by AI' })}
          </Text>
        ) : null}
        {state.phase === 'error' ? <View style={styles.start}>{retry}</View> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sticker: { flexShrink: 0 },
  titles: { flex: 1, gap: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reasons: { gap: 10 },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  start: { alignSelf: 'flex-start' },
});
