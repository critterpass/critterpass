/**
 * NOT SURE YET (3f-4): a private sheet between the member and their guide. JUST YOU AND {GUIDE};
 * "{organiser} only sees 'maybe'". Picking THE COST / THE DATES / THE PLAN / SOMETHING ELSE asks
 * the server for options the cost engine decided (skip an item, ask the crew without a name in a
 * crew of four or more); toggles re-count the share, and the button follows ("I'M IN AT $1,170").
 * "Still thinking. Ask me on Sunday" schedules a nudge for that evening.
 */
import type { PrivateReason } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { toast } from '@/motion';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { Icon } from '@/ui/icons/Icon';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import {
  choosePrivateOptionCommand,
  scheduleFollowupCommand,
  submitPrivateReasonCommand,
} from '../data/commands';
import { wholeMoney } from '../data/format';
import type { Saving } from '../data/savings';
import { ShareCard, shareWith } from '../your-version/share-card';
import { nextSundayEvening, parseOptions, type PrivateOption } from './options';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'], gap: th.space['14'] },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: th.space['6'] },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['8'] },
  footer: { gap: th.space['8'], alignItems: 'center' },
}));

export interface ObjectionSheetProps {
  readonly proposalId: string;
  readonly guideName: string;
  readonly organiserName: string;
  readonly locale: string;
  readonly baseMinor: number | null;
  readonly currency: string | null;
  readonly freeCancelLine: string | null;
  readonly onBoard: (optionIds: readonly string[]) => void;
  readonly onClose: () => void;
}

export interface ObjectionAnswer {
  readonly threadId: string;
  readonly options: readonly PrivateOption[];
}

export interface ObjectionSheetViewProps extends Omit<ObjectionSheetProps, 'proposalId'> {
  readonly reason: PrivateReason | null;
  readonly answer: ObjectionAnswer | null;
  readonly chosen: readonly string[];
  readonly pending: boolean;
  readonly failed: boolean;
  readonly onReason: (reason: PrivateReason) => void;
  readonly onToggle: (optionId: string, on: boolean) => void;
  readonly onAskCrew: (threadId: string, optionId: string) => void;
  readonly onLater: () => void;
}

/** The sheet as a pure view (the lab draws it with fixed answers). */
export function ObjectionSheetView(props: ObjectionSheetViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { reason, answer, chosen } = props;
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
  const base = props.baseMinor;
  const currency = props.currency;
  const share = base === null ? null : shareWith(base, skips, chosen);
  const reasons: { id: PrivateReason; label: string }[] = [
    { id: 'cost', label: t({ id: 'proposal.objection.cost', message: 'The cost' }) },
    { id: 'dates', label: t({ id: 'proposal.objection.dates', message: 'The dates' }) },
    { id: 'plan', label: t({ id: 'proposal.objection.plan', message: 'The plan' }) },
    { id: 'other', label: t({ id: 'proposal.objection.other', message: 'Something else' }) },
  ];
  const amount =
    share === null || currency === null ? null : wholeMoney(props.locale, share, currency);
  return (
    <Sheet
      detents={['large']}
      onDismiss={props.onClose}
      accessibilityLabel={t({ id: 'proposal.objection.a11y', message: 'Not sure yet' })}
      testID="objection-sheet"
    >
      <SheetScrollView>
        <View style={styles.body}>
          <View style={styles.eyebrow}>
            <Icon name="lock" size={14} color={theme.semantic.state.success} decorative />
            <Text variant="eyebrow" color={theme.semantic.state.success}>
              {t({
                id: 'proposal.objection.private',
                message: `Just you and ${props.guideName}`,
              })}
            </Text>
          </View>
          <Text variant="h1" accessibilityRole="header">
            {t({ id: 'proposal.objection.title', message: 'What’s holding you back?' })}
          </Text>
          <Text variant="body" color={theme.semantic.text.secondary}>
            {t({
              id: 'proposal.objection.sub',
              message: `${props.organiserName} only sees “maybe”. Pick one and I’ll see what I can move.`,
            })}
          </Text>
          <View style={styles.reasons}>
            {reasons.map((r) => (
              <ChoiceChip
                key={r.id}
                label={r.label}
                selected={reason === r.id}
                onPress={() => props.onReason(r.id)}
                testID={`objection-reason-${r.id}`}
              />
            ))}
          </View>
          {props.pending ? (
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {t({
                id: 'proposal.objection.thinking',
                message: `${props.guideName} is looking at what can move…`,
              })}
            </Text>
          ) : null}
          {props.failed ? (
            <Text variant="bodySm" color={theme.semantic.state.urgent} testID="objection-failed">
              {t({
                id: 'proposal.objection.failed',
                message: 'I couldn’t reach the plan just now. Try again in a moment.',
              })}
            </Text>
          ) : null}
          {answer !== null && skips.length === 0 && askCrew === null ? (
            <Text variant="bodySm" color={theme.semantic.text.secondary} testID="objection-none">
              {t({
                id: 'proposal.objection.nothing',
                message: 'Nothing here moves the cost for just you. You can still take your time.',
              })}
            </Text>
          ) : null}
          {base !== null && currency !== null && skips.length > 0 ? (
            <ShareCard
              locale={props.locale}
              baseMinor={base}
              currency={currency}
              savings={skips}
              chosen={chosen}
              onToggle={props.onToggle}
            />
          ) : null}
          {askCrew !== null && answer !== null ? (
            <TextLink
              label={askCrew.label}
              onPress={() => props.onAskCrew(answer.threadId, askCrew.id)}
              testID="objection-ask-crew"
            />
          ) : null}
          {props.freeCancelLine === null ? null : (
            <Text variant="caption" color={theme.semantic.text.secondary}>
              {props.freeCancelLine}
            </Text>
          )}
          <View style={styles.footer}>
            <PillButton
              label={
                amount === null
                  ? t({ id: 'proposal.objection.in', message: 'I’m in' })
                  : t({ id: 'proposal.objection.inAt', message: `I’m in at ${amount}` })
              }
              onPress={() => props.onBoard(chosen)}
              testID="objection-board"
            />
            <TextLink
              label={t({
                id: 'proposal.objection.later',
                message: 'Still thinking. Ask me on Sunday',
              })}
              onPress={props.onLater}
              testID="objection-later"
            />
          </View>
        </View>
      </SheetScrollView>
    </Sheet>
  );
}

/** The sheet wired to the phone: the private reason goes to the server and comes back as options. */
export function ObjectionSheet(props: ObjectionSheetProps) {
  const submit = useCommand(submitPrivateReasonCommand);
  const choose = useCommand(choosePrivateOptionCommand);
  const followup = useCommand(scheduleFollowupCommand);
  const [reason, setReason] = useState<PrivateReason | null>(null);
  const [answer, setAnswer] = useState<ObjectionAnswer | null>(null);
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [failed, setFailed] = useState(false);

  const pick = async (next: PrivateReason) => {
    setReason(next);
    setAnswer(null);
    setChosen([]);
    setFailed(false);
    const result = await submit.send({ proposal_id: props.proposalId, reason: next });
    if (result.kind === 'applied') setAnswer(parseOptions(result.result));
    else setFailed(true);
  };

  return (
    <ObjectionSheetView
      {...props}
      reason={reason}
      answer={answer}
      chosen={chosen}
      pending={submit.pending}
      failed={failed}
      onReason={(next) => void pick(next)}
      onToggle={(id, on) => setChosen(on ? [...chosen, id] : chosen.filter((c) => c !== id))}
      onAskCrew={(threadId, optionId) => {
        void choose.send({ thread_id: threadId, option_id: optionId });
        toast.show({
          id: 'proposal-asked-crew',
          title: t({ id: 'proposal.objection.asked', message: 'Asked without your name' }),
        });
      }}
      onLater={() => {
        void followup.send({
          proposal_id: props.proposalId,
          at_local: nextSundayEvening(new Date()),
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        toast.show({
          id: 'proposal-followup',
          title: t({ id: 'proposal.objection.laterDone', message: 'I’ll ask you on Sunday' }),
        });
        props.onClose();
      }}
    />
  );
}
