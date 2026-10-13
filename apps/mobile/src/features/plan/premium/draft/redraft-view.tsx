/**
 * A redrafted day (4.24) in the premium look, seen only by the organiser: while the guide thinks,
 * its working line; then "Day 3, redrafted" with the guide's summary, each change (the old line
 * struck, the new one, why) with a check to keep it, what the day gains (travel, pace, must-dos,
 * cost), and the foot: Keep it, or put the old day back. A redraft that couldn't beat the day,
 * failed or was already settled says so with its way back. Reads and commands are the shared
 * `RedraftDiffScreen`'s.
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { guideSticker } from '@/ui/premium/stickers/guides';
import {
  Button,
  Card,
  Checkbox,
  CritterSticker,
  EmptyState,
  LoadingCritter,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { changeCardWords, metricWords } from '../../draft/redraft/redraft-words';
import type { RedraftDiffViewProps } from '../../draft/redraft/redraft-props';

export function PremiumRedraftView(props: RedraftDiffViewProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const info = guideSticker(props.guide);
  const guideName = info.name;
  const n = props.dayNo ?? 0;
  const old = props.baseTitle ?? '';
  const screen = (body: ReactNode, foot: ReactNode = null) => (
    <PushScreen
      title={t({ id: 'plan.premium.redraft.title', message: `Change Day ${n}` })}
      subtitle={t({ id: 'planDraft.onlyYou', message: 'Only you see this' })}
      backLabel={t({ id: 'planDraft.diff.backEyebrow', message: `${guideName}’s draft` })}
      scroll={false}
      testID="redraft-screen"
    >
      <ScrollView contentContainerStyle={{ padding: theme.space.gap16, gap: theme.space.gap12 }}>
        {body}
      </ScrollView>
      {foot === null ? null : (
        <View
          style={{
            paddingHorizontal: theme.space.titleGutter,
            paddingBottom: insets.bottom + theme.space.gap12,
            gap: theme.space.gap4,
            alignItems: 'center',
          }}
        >
          {foot}
        </View>
      )}
    </PushScreen>
  );
  const outcome = (title: string, line: string) =>
    screen(
      <EmptyState
        title={title}
        line={line}
        critter={{ kind: info.kind, name: guideName }}
        check={false}
        action={
          <Button
            label={t({ id: 'plan.premium.redraft.back', message: 'Back to the draft' })}
            onPress={props.onBack}
            testID="redraft-outcome-back"
          />
        }
      />,
    );
  if (props.phase === 'thinking') {
    return screen(
      <View style={{ paddingTop: theme.space.gap16 * 4 }}>
        <LoadingCritter
          label={t({
            id: 'plan.premium.redraft.thinking',
            message: `${guideName} is redrafting Day ${n}`,
          })}
          critter={{ kind: info.kind, name: guideName }}
        />
      </View>,
    );
  }
  if (props.phase === 'identical') {
    return outcome(
      t({ id: 'planDraft.diff.identicalTitle', message: 'Couldn’t beat this day' }),
      t({
        id: 'planDraft.diff.identical',
        message: `Day ${n} is already the best I can do. That one didn’t count.`,
      }),
    );
  }
  if (props.phase === 'failed') {
    return outcome(
      t({ id: 'planDraft.diff.failedTitle', message: 'That redraft didn’t work' }),
      t({
        id: 'planDraft.diff.failed',
        message: 'It didn’t count. Try again, maybe with another reason.',
      }),
    );
  }
  if (props.phase === 'settled') {
    return outcome(
      t({ id: 'planDraft.diff.settledTitle', message: 'Already sorted' }),
      t({ id: 'planDraft.diff.settled', message: 'You’ve kept or put back this redraft already.' }),
    );
  }
  const kept = props.cards.some((card) => !props.off.has(card.key));
  return screen(
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap12 }}>
        <CritterSticker kind={info.kind} name={guideName} size={56} />
        <Text variant="display" accessibilityRole="header" style={{ flex: 1 }}>
          {t({ id: 'planDraft.diff.title', message: `Day ${n}, redrafted` })}
        </Text>
      </View>
      <Text variant="body" tone="muted" testID="redraft-summary">
        {props.summary ??
          t({
            id: 'planDraft.diff.summaryPlain',
            message: `Here’s what ${guideName} would change.`,
          })}
      </Text>
      {props.cards.map((card, index) => {
        const words = changeCardWords(card, props.locale, props.tz);
        const on = !props.off.has(card.key);
        return (
          <Card
            key={card.key}
            testID={`redraft-change-${String(index)}`}
            style={{
              flexDirection: 'row',
              gap: theme.space.gap12,
              padding: theme.space.rowPadH,
              opacity: on ? 1 : 0.5,
            }}
          >
            <Checkbox
              checked={on}
              onChange={() => props.onToggle(card.key)}
              accessibilityLabel={
                on
                  ? t({ id: 'planDraft.change.keep', message: 'Keep this change' })
                  : t({ id: 'planDraft.change.skip', message: 'Leave this one as it was' })
              }
              testID={`redraft-change-toggle-${String(index)}`}
            />
            <View style={{ flex: 1, gap: 2 }}>
              {words.before === null ? null : (
                <Text variant="caption" tone="muted" style={{ textDecorationLine: 'line-through' }}>
                  {words.before}
                </Text>
              )}
              <Text variant="rowTitle">{words.after}</Text>
              {words.reason === null ? null : (
                <Text variant="captionMuted" tone="muted">
                  {words.reason}
                </Text>
              )}
            </View>
          </Card>
        );
      })}
      {props.chips.length === 0 ? null : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap6 }}>
          {props.chips.map((chip, index) => (
            <View
              key={index}
              style={{
                height: 26,
                borderRadius: 13,
                paddingHorizontal: theme.space.gap10,
                justifyContent: 'center',
                backgroundColor: theme.color.control,
              }}
            >
              <Text variant="badge">{metricWords(chip, props.locale)}</Text>
            </View>
          ))}
        </View>
      )}
      {(props.takenOut ?? []).map((entry) => (
        <Text key={entry.poiId} variant="caption" color={theme.color.destructive.text}>
          {t({
            id: 'planDraft.premium.leftOut.takenOut',
            message: `Taken out of the trip: ${entry.name}`,
          })}
        </Text>
      ))}
    </>,
    <>
      {props.clash === true ? (
        <Text
          variant="caption"
          color={theme.color.destructive.helper}
          align="center"
          testID="redraft-clash"
        >
          {t({
            id: 'planDraft.diff.clash',
            message:
              'Leaving that one out would put two stops at the same time. Tick it again, or put the whole day back and ask differently.',
          })}
        </Text>
      ) : null}
      <View style={{ alignSelf: 'stretch' }}>
        <Button
          label={t({ id: 'planDraft.diff.keep', message: 'Keep it' })}
          onPress={props.onKeep}
          disabled={!kept || props.clash === true}
          loading={props.sending}
          testID="redraft-keep"
        />
      </View>
      <TextButton
        label={
          old === ''
            ? t({ id: 'planDraft.diff.putBackDay', message: 'Put the day back' })
            : t({ id: 'planDraft.diff.putBack', message: `Put ${old} back` })
        }
        onPress={props.onPutBack}
        testID="redraft-put-back"
      />
      {props.onBoost === undefined ? null : (
        <TextButton
          label={t({ id: 'planDraft.spent.boost', message: 'Boost for unlimited redrafts' })}
          onPress={props.onBoost}
          testID="redraft-boost"
        />
      )}
    </>,
  );
}
