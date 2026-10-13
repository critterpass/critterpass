/**
 * A storm over a plan day (6.07): a rain-tinted band with the day in sky blue, the storm's title
 * large, what the sea or sky is doing as chips and the guide's line; then the options as cards
 * (the picked one ringed in ink, the guide's pick wearing a tilted sun sticker), who voted, and
 * the docked verb ("Swap the days"). After the vote it says what the crew chose and, for a booked
 * seat, what the booker does next. Offline, the vote waits and says so.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { crewAccent, turn } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  CrewStack,
  EmptyState,
  OfflinePill,
  PressableScale,
  ring,
  Skeleton,
  Text,
  usePremiumTheme,
} from '@/ui/premium';
import { KeyboardStickyFooter, PushScreen } from '@/ui/premium/shell';

import {
  chips,
  closesLine,
  ctaLabel,
  dayEyebrow,
  decidedLine,
  longDate,
  optionDetail,
  optionText,
  seatLine,
  stormLines,
  tallyLine,
  votedLabel,
} from '../../disruptions/storm/copy';
import type { StormOptionId } from '../../disruptions/storm/model';
import type { StormViewProps } from '../../disruptions/storm/view-types';
import { useStormScreen } from '../../disruptions/storm/use-storm-screen';

/** The storm page once its poll is read (also what the screen tests render). */
export function StormReady({ props }: { readonly props: StormViewProps }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const lines = stormLines();
  const [picked, setPicked] = useState<StormOptionId | null>(null);
  const model = props.model;
  if (model === null) return null;
  const selected = picked ?? model.myVote ?? model.recommended ?? model.options[0]?.id ?? null;
  const option = model.options.find((o) => o.id === selected) ?? null;
  const leading = model.options.find((o) => o.id === model.tally[0]?.id) ?? null;
  const voting = model.phase === 'voting';
  const settled = selected !== null && selected === model.myVote;
  const seatDate = longDate(model.seatDate ?? model.options[0]?.swap_day ?? null, locale);
  const crew = model.votedIds.map((uid) => {
    const at = Math.max(
      0,
      props.people.findIndex((p) => p.id === uid),
    );
    return { id: uid, name: props.people[at]?.name ?? '', color: crewAccent(at) };
  });
  return (
    <>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 140, gap: th.space.gap14 }}
      >
        <View
          style={[
            styles.band,
            { backgroundColor: th.color.status.rain.bg, paddingHorizontal: th.space.titleGutter },
          ]}
          testID="storm-hero"
        >
          <Text variant="label" color={th.color.status.rain.text}>
            {dayEyebrow(model.day, locale)}
          </Text>
          <Text variant="display" accessibilityRole="header">
            {props.title}
          </Text>
          <View style={styles.chips}>
            {chips(model, locale).map((chip) => (
              <View key={chip} style={[styles.chip, { backgroundColor: th.color.card }]}>
                <Text variant="badge">{chip}</Text>
              </View>
            ))}
          </View>
          {props.line === '' ? null : (
            <Text variant="rowText" tone="inkSecondary">
              {props.line}
            </Text>
          )}
        </View>
        <View style={{ paddingHorizontal: th.space.gap16, gap: th.space.gap10 }}>
          {props.offline ? <OfflinePill label={lines.offline} /> : null}
          {model.phase === 'withdrawn' ? (
            <Text variant="headline" testID="storm-withdrawn">
              {lines.withdrawn}
            </Text>
          ) : null}
          {model.phase === 'decided' && model.chosen !== null ? (
            <Text variant="headline" testID="storm-decided">
              {decidedLine(model.chosen)}
            </Text>
          ) : null}
          {model.seat === null ? null : (
            <View
              style={[
                styles.card,
                {
                  borderRadius: th.radius.card,
                  backgroundColor: th.color.card,
                  boxShadow: th.shadow.card,
                },
              ]}
              testID={`storm-seat-${model.seat}`}
            >
              <Text variant="rowText">
                {seatLine(
                  model.seat,
                  props.booker?.name ?? '',
                  props.booker?.me ?? false,
                  seatDate,
                )}
              </Text>
              {model.seat === 'awaiting_booker_payment' && props.booker?.me === true ? (
                <Button
                  label={lines.confirmPay}
                  size="medium"
                  loading={props.sending}
                  onPress={props.onConfirmPay}
                  testID="storm-confirm-pay"
                />
              ) : null}
            </View>
          )}
          {model.phase === 'withdrawn'
            ? null
            : model.options.map((o) => {
                const on = voting ? selected === o.id : model.chosen === o.id;
                return (
                  <PressableScale
                    key={o.id}
                    onPress={() => setPicked(o.id)}
                    disabled={!model.canVote || !voting}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    testID={`storm-option-${o.id}`}
                  >
                    <View
                      style={[
                        styles.card,
                        {
                          borderRadius: th.radius.card,
                          backgroundColor: th.color.card,
                          boxShadow: on
                            ? [ring(2, th.color.ink), th.shadow.card].join(', ')
                            : th.shadow.card,
                        },
                      ]}
                    >
                      <Text variant="rowTitle">{optionText(o, locale)}</Text>
                      <Text variant="caption" tone="muted">
                        {optionDetail(o, locale)}
                      </Text>
                      {o.recommended ? (
                        <View
                          style={[
                            styles.pick,
                            { backgroundColor: th.accent.sun, transform: [turn(5)] },
                          ]}
                        >
                          <Text variant="tier" color={th.color.onAccent}>
                            {t({
                              id: 'trip.disruptions.storm.premiumPick',
                              message: `${props.guideName} picks`,
                            })}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </PressableScale>
                );
              })}
          {voting ? (
            <View style={styles.tally}>
              {crew.length === 0 ? null : (
                <CrewStack
                  members={crew}
                  size={24}
                  accessibilityLabel={tallyLine(model, leading, locale)}
                />
              )}
              <Text variant="caption" tone="muted" style={styles.flex} testID="storm-tally">
                {tallyLine(model, leading, locale)}
              </Text>
            </View>
          ) : null}
          {voting && model.closesAt !== null ? (
            <Text variant="captionMuted" tone="muted">
              {closesLine(model.closesAt, props.tz, locale)}
            </Text>
          ) : null}
        </View>
      </ScrollView>
      {voting ? (
        <KeyboardStickyFooter>
          <View style={{ paddingHorizontal: th.space.titleGutter, paddingBottom: th.space.gap12 }}>
            {model.canVote ? (
              <Button
                label={
                  settled && model.myVote !== null
                    ? votedLabel(model.myVote)
                    : ctaLabel(option, locale)
                }
                disabled={option === null || settled}
                loading={props.sending}
                onPress={() => {
                  if (option !== null && !settled) props.onVote(option.id);
                }}
                testID="storm-vote"
              />
            ) : (
              <Text variant="caption" tone="muted" align="center" testID="storm-not-voting">
                {lines.notVoting}
              </Text>
            )}
          </View>
        </KeyboardStickyFooter>
      ) : null}
    </>
  );
}

export function StormPremium({ pollId }: { readonly pollId: string }) {
  const th = usePremiumTheme();
  const props = useStormScreen({ pollId });
  const lines = stormLines();
  return (
    <PushScreen title={lines.back} backLabel={lines.back} scroll={false} testID="storm-screen">
      {props.state === 'loading' ? (
        <View style={{ padding: th.space.gutter }}>
          <Skeleton height={220} radius={th.radius.cardLarge} />
        </View>
      ) : props.state === 'missing' ? (
        <EmptyState title={lines.missingTitle} line={lines.missing} />
      ) : (
        <StormReady props={props} />
      )}
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  band: { paddingTop: 12, paddingBottom: 20, gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { height: 24, borderRadius: 12, paddingHorizontal: 9, justifyContent: 'center' },
  card: { padding: 14, gap: 4 },
  pick: {
    position: 'absolute',
    right: 12,
    top: -10,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  tally: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
});
