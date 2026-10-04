/**
 * NOT SURE YET (3f-4): a private sheet between the member and their guide. JUST YOU AND {GUIDE};
 * "{organiser} only sees 'maybe'". Picking THE COST / THE DATES / THE PLAN / SOMETHING ELSE asks
 * the server for options the cost engine decided (skip an item, ask the crew without a name in a
 * crew of four or more); toggles re-count the share, and the button follows ("I'M IN AT $1,170").
 * When nothing can move, the line answers the reason picked (the plan, the dates, the cost), and
 * THE PLAN offers the plan itself, where a stop takes a note. "Still thinking. Ask me tonight"
 * (or tomorrow morning, or on Sunday) schedules the guide's nudge for a time before the answer is
 * due; it is not offered when the answer is due too soon. The wired sheet is ./objection-host.tsx.
 */
import type { PrivateReason } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { Pressable, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { GUIDE_STICKERS, type GuideStickerId } from '@/ui/avatar/guides';
import { Icon } from '@/ui/icons/Icon';
import type { DoodleName } from '@/ui/icons/generated';
import { Sticker } from '@/ui/sticker/Sticker';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { wholeMoney } from '../data/format';
import type { Saving } from '../data/savings';
import { ShareCard, shareWith } from '../your-version/share-card';
import { laterLabel, nothingLine } from './objection-copy';
import type { FollowUp, PrivateOption } from './options';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'], gap: th.space['14'] },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: th.space['6'] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: th.space['8'] },
  grow: { flex: 1 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['8'] },
  reason: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['8'],
    minHeight: th.space['32'] * 2,
    paddingHorizontal: th.space['12'],
    borderRadius: th.radius.lg,
    borderWidth: 2,
    borderColor: th.semantic.border.control,
  },
  footer: { gap: th.space['8'], alignItems: 'center' },
}));

export interface ObjectionSheetProps {
  readonly proposalId: string;
  readonly guide: GuideStickerId;
  readonly guideName: string;
  readonly organiserName: string;
  readonly locale: string;
  readonly baseMinor: number | null;
  readonly currency: string | null;
  readonly freeCancelLine: string | null;
  /** When the answer is due: "ask me later" lands before it. */
  readonly replyBy: string | null;
  /** Opens the plan, where a stop takes a note; absent until the plan area offers it. */
  readonly onOpenPlan?: (() => void) | undefined;
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
  /** When the guide would ask again; null offers no "ask me later". */
  readonly later: FollowUp | null;
  readonly onLater: () => void;
}

/** The sheet as a pure view (the lab draws it with fixed answers). */
export function ObjectionSheetView(props: ObjectionSheetViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { reason, answer, chosen } = props;
  const sticker = GUIDE_STICKERS[props.guide];
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
  const reasons: { id: PrivateReason; label: string; icon: DoodleName }[] = [
    {
      id: 'cost',
      icon: 'wallet',
      label: t({ id: 'proposal.objection.cost', message: 'The cost' }),
    },
    {
      id: 'dates',
      icon: 'cal',
      label: t({ id: 'proposal.objection.dates', message: 'The dates' }),
    },
    {
      id: 'plan',
      icon: 'ticket',
      label: t({ id: 'proposal.objection.plan', message: 'The plan' }),
    },
    {
      id: 'other',
      icon: 'chat',
      label: t({ id: 'proposal.objection.other', message: 'Something else' }),
    },
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
          <View style={styles.titleRow}>
            <Text variant="h1" accessibilityRole="header" style={styles.grow}>
              {t({ id: 'proposal.objection.title', message: 'What’s holding you back?' })}
            </Text>
            <Sticker kind={sticker.kind} name={sticker.name} size={88} />
          </View>
          <Text variant="body" color={theme.semantic.text.secondary}>
            {t({
              id: 'proposal.objection.sub',
              message: `${props.organiserName} only sees “maybe”. Pick one and I’ll see what I can move.`,
            })}
          </Text>
          <View style={styles.reasons}>
            {reasons.map((r) => {
              const on = reason === r.id;
              const ink = on ? theme.semantic.text.onAccent : theme.semantic.text.primary;
              return (
                <Pressable
                  key={r.id}
                  style={[
                    styles.reason,
                    on
                      ? {
                          backgroundColor: theme.semantic.action.primary,
                          borderColor: theme.semantic.action.primary,
                        }
                      : null,
                  ]}
                  onPress={() => props.onReason(r.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={r.label}
                  testID={`objection-reason-${r.id}`}
                >
                  <Icon name={r.icon} size={22} color={ink} decorative />
                  <Text variant="title" color={ink} style={styles.grow}>
                    {r.label.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
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
              {nothingLine(reason, props.organiserName)}
            </Text>
          ) : null}
          {answer !== null && reason === 'plan' && props.onOpenPlan !== undefined ? (
            <TextLink
              label={t({ id: 'proposal.objection.openPlan', message: 'Open the plan' })}
              onPress={props.onOpenPlan}
              testID="objection-open-plan"
            />
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
            {props.later === null ? null : (
              <TextLink
                label={laterLabel(props.later)}
                onPress={props.onLater}
                testID="objection-later"
              />
            )}
          </View>
        </View>
      </SheetScrollView>
    </Sheet>
  );
}
