/**
 * Not sure yet, in the premium look (undesigned; the tall in-page sheet): just the member and
 * their guide. Picking the cost, the dates, the plan or something else asks for what can move;
 * savings come back as toggles that re-count the share and the button follows ("I'm in at
 * $1,170"); when nothing can move the guide says what to do instead; "Still thinking. Ask me
 * tonight" schedules a nudge before the answer is due.
 */
import type { PrivateReason } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';

import { OverlaySheet } from '@/features/plan';
import { guideSticker } from '@/ui/avatar/guides';
import {
  Button,
  CritterSticker,
  Icon,
  PressableScale,
  Text,
  TextButton,
  usePremiumTheme,
  type PremiumIconName,
} from '@/ui/premium';

import { wholeMoney } from '../../data/format';
import type { Saving } from '../../data/savings';
import { laterLabel, nothingLine } from '../../objection/objection-copy';
import type { ObjectionSheetViewProps } from '../../objection/objection-host';
import { shareWith } from '../../your-version/version-model';
import { PremiumShareCard } from './share-card';

function reasons(): readonly { id: PrivateReason; label: string; icon: PremiumIconName }[] {
  return [
    {
      id: 'cost',
      icon: 'wallet',
      label: t({ id: 'proposal.objection.cost', message: 'The cost' }),
    },
    {
      id: 'dates',
      icon: 'ticket',
      label: t({ id: 'proposal.objection.dates', message: 'The dates' }),
    },
    { id: 'plan', icon: 'pin', label: t({ id: 'proposal.objection.plan', message: 'The plan' }) },
    {
      id: 'other',
      icon: 'more',
      label: t({ id: 'proposal.objection.other', message: 'Something else' }),
    },
  ];
}

export function PremiumObjectionView(props: ObjectionSheetViewProps) {
  const theme = usePremiumTheme();
  const { reason, answer, chosen } = props;
  const sticker = guideSticker(props.guide);
  const skips: Saving[] = (answer?.options ?? []).flatMap((o) =>
    o.kind === 'skip_item' && o.deltaMinor !== null && o.currency !== null
      ? [
          {
            id: o.id,
            label: o.label.replace(/^Skip\s+/u, ''),
            deltaMinor: o.deltaMinor,
            displayDeltaMinor: o.displayDeltaMinor ?? o.deltaMinor,
            currency: o.currency,
          },
        ]
      : [],
  );
  const askCrew = answer?.options.find((o) => o.kind === 'ask_crew') ?? null;
  const { baseMinor: base, currency } = props;
  const share = base === null ? null : shareWith(base, skips, chosen);
  const amount =
    share === null || currency === null ? null : wholeMoney(props.locale, share, currency);
  return (
    <OverlaySheet
      tall
      title={t({ id: 'proposal.objection.title', message: 'What’s holding you back?' })}
      line={t({
        id: 'proposal.objection.sub',
        message: `${props.organiserName} only sees “maybe”. Pick one and I’ll see what I can move.`,
      })}
      aside={<CritterSticker kind={sticker.kind} name={sticker.name} size={56} />}
      closeLabel={t({ id: 'proposal.premium.close', message: 'Close' })}
      onDismiss={props.onClose}
      footer={
        <View style={styles.footer}>
          <Button
            label={
              amount === null
                ? t({ id: 'proposal.objection.in', message: 'I’m in' })
                : t({ id: 'proposal.objection.inAt', message: `I’m in at ${amount}` })
            }
            onPress={() => props.onBoard(chosen)}
            testID="objection-board"
          />
          {props.later === null ? null : (
            <TextButton
              align="center"
              label={laterLabel(props.later)}
              onPress={props.onLater}
              testID="objection-later"
            />
          )}
        </View>
      }
      testID="objection-sheet"
    >
      <View style={styles.stack}>
        <View style={styles.private}>
          <Icon name="lock" size={14} color={theme.color.status.booked.text} />
          <Text variant="captionMuted" color={theme.color.status.booked.text}>
            {t({ id: 'proposal.objection.private', message: `Just you and ${props.guideName}` })}
          </Text>
        </View>
        <View style={styles.grid}>
          {reasons().map((r) => {
            const on = reason === r.id;
            return (
              <PressableScale
                key={r.id}
                onPress={() => props.onReason(r.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={r.label}
                testID={`objection-reason-${r.id}`}
                style={[
                  styles.reason,
                  {
                    borderRadius: theme.radius.cardRow,
                    backgroundColor: on ? theme.color.ink : theme.color.controlSheet,
                  },
                ]}
              >
                <Icon name={r.icon} size={20} color={on ? theme.color.onInk : theme.color.ink} />
                <Text variant="rowTextStrong" tone={on ? 'onInk' : 'ink'}>
                  {r.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
        {props.pending ? (
          <Text variant="rowText" tone="muted">
            {t({
              id: 'proposal.objection.thinking',
              message: `${props.guideName} is looking at what can move…`,
            })}
          </Text>
        ) : null}
        {props.failed ? (
          <Text variant="rowText" color={theme.color.destructive.text} testID="objection-failed">
            {t({
              id: 'proposal.objection.failed',
              message: 'I couldn’t reach the plan just now. Try again in a moment.',
            })}
          </Text>
        ) : null}
        {answer !== null && skips.length === 0 && askCrew === null ? (
          <Text variant="rowText" tone="muted" testID="objection-none">
            {nothingLine(reason, props.organiserName)}
          </Text>
        ) : null}
        {answer !== null && reason === 'plan' && props.onOpenPlan !== undefined ? (
          <TextButton
            label={t({ id: 'proposal.objection.openPlan', message: 'Open the plan' })}
            onPress={props.onOpenPlan}
            testID="objection-open-plan"
          />
        ) : null}
        {base !== null && currency !== null && skips.length > 0 ? (
          <PremiumShareCard
            locale={props.locale}
            baseMinor={base}
            currency={currency}
            savings={skips}
            chosen={chosen}
            onToggle={props.onToggle}
          />
        ) : null}
        {askCrew !== null && answer !== null ? (
          <TextButton
            label={askCrew.label}
            onPress={() => props.onAskCrew(answer.threadId, askCrew.id)}
            testID="objection-ask-crew"
          />
        ) : null}
        {props.freeCancelLine === null ? null : (
          <Text variant="caption" tone="muted">
            {props.freeCancelLine}
          </Text>
        )}
      </View>
    </OverlaySheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  private: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reason: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  footer: { gap: 6 },
});
