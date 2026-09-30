/**
 * Review changes (3e-3), from props only: "← DAY 3–4" and the trigger tag, the guide with the
 * headline and summary, the change cards, the summary chips, and the actions: send to the crew
 * (with the yeses it needs), apply to my plan only, or, once it is a vote, yes / no with the tally.
 * States: loading, missing, all dropped, must-do or booking warnings, stale, expired, rejected,
 * approved, applying, and a failed send or apply.
 */
import { t } from '@lingui/core/macro';
import { ScrollView, View } from 'react-native';

import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import type { StackMember } from '@/ui/people/AvatarStack';
import type { GuideId } from '@/ui/people/GuideLine';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { ChangeCardView } from './change-card';
import type { ReviewNumbers } from './model/review-numbers';
import { ReviewChips } from './review-chips';
import { noticeText, type ReviewNotice } from './review-copy';

export interface ReviewCard {
  readonly key: string;
  readonly before: string | null;
  readonly after: string | null;
  readonly reason: string;
  readonly people: readonly StackMember[];
  readonly accepted: boolean;
}

export type { ReviewNotice } from './review-copy';

export interface ReviewVote {
  readonly yes: number;
  readonly needed: number;
  readonly mine: 'yes' | 'no' | null;
  readonly canVote: boolean;
  readonly onYes: () => void;
  readonly onNo: () => void;
}

export interface ReviewViewProps {
  readonly state: 'loading' | 'missing' | 'ready';
  readonly backLabel: string;
  readonly tag: { readonly label: string; readonly tone: 'info' | 'warning' | 'plain' } | null;
  readonly guide: { readonly id: GuideId; readonly name: string };
  readonly title: string;
  readonly summary: string;
  readonly cards: readonly ReviewCard[];
  readonly onToggle: ((key: string, accepted: boolean) => void) | null;
  readonly numbers: ReviewNumbers | null;
  readonly send: {
    readonly label: string;
    readonly disabled: boolean;
    readonly busy: boolean;
    readonly onPress: () => void;
  } | null;
  readonly personal: { readonly onPress: () => void; readonly busy: boolean } | null;
  readonly vote: ReviewVote | null;
  readonly organiserApply: (() => void) | null;
  readonly warnings: { readonly mustDo: boolean; readonly booking: boolean };
  readonly notice: ReviewNotice | null;
  readonly onBack: () => void;
}

const useStyles = makeStyles((th) => ({
  content: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['32'],
    gap: th.space['12'],
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tag: {
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['4'],
  },
  hero: { flexDirection: 'row', alignItems: 'center', gap: th.space['12'] },
  notice: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['12'],
    gap: th.space['6'],
  },
  footer: { gap: th.space['12'], alignItems: 'center', paddingTop: th.space['8'] },
  voteRow: { flexDirection: 'row', gap: th.space['12'], alignSelf: 'stretch' },
}));

function Notice({ text, testID }: { readonly text: string; readonly testID: string }) {
  const styles = useStyles();
  return (
    <View style={styles.notice} testID={testID}>
      <Text variant="bodySm">{text}</Text>
    </View>
  );
}

export function ReviewView(props: ReviewViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const sticker = GUIDE_STICKERS[props.guide.id];
  const tagColour =
    props.tag?.tone === 'info'
      ? theme.semantic.state.info
      : props.tag?.tone === 'warning'
        ? theme.semantic.state.warning
        : theme.semantic.bg.control;
  if (props.state !== 'ready') {
    return (
      <Scaffold variant="dark" edges={['top', 'bottom']} testID="plan-review">
        <View style={styles.content}>
          <BackEyebrow label={props.backLabel} onPress={props.onBack} />
          {props.state === 'loading' ? (
            <Skeleton preset="list" repeat={4} testID="plan-review-loading" />
          ) : (
            <Text variant="body" testID="plan-review-missing">
              {t({
                id: 'plan.review.missing',
                message: 'This change isn’t on your phone yet. It shows up once it syncs.',
              })}
            </Text>
          )}
        </View>
      </Scaffold>
    );
  }
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="plan-review">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <BackEyebrow label={props.backLabel} onPress={props.onBack} />
          {props.tag ? (
            <View style={[styles.tag, { backgroundColor: tagColour }]} testID="plan-review-tag">
              <Text
                variant="label"
                color={props.tag.tone === 'plain' ? undefined : theme.semantic.text.onAccent}
              >
                {upper(props.tag.label, locale)}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.hero}>
          <Sticker kind={sticker.kind} name={sticker.name} size={64} />
          <Text variant="h1" accessibilityRole="header" style={{ flex: 1 }}>
            {upper(props.title, locale)}
          </Text>
        </View>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {props.summary}
        </Text>
        {props.cards.map((card, index) => (
          <ChangeCardView
            key={card.key}
            index={index}
            before={card.before}
            after={card.after}
            reason={card.reason}
            people={card.people}
            accepted={card.accepted}
            onToggle={
              props.onToggle === null ? undefined : () => props.onToggle?.(card.key, !card.accepted)
            }
            testID={`plan-review-card-${index}`}
          />
        ))}
        {props.numbers ? <ReviewChips numbers={props.numbers} /> : null}
        {props.warnings.mustDo ? (
          <Notice
            text={t({
              id: 'plan.review.warn.mustDo',
              message: 'This touches someone’s must-do. Check it with them before it goes in.',
            })}
            testID="plan-review-must-do"
          />
        ) : null}
        {props.warnings.booking ? (
          <Notice
            text={t({
              id: 'plan.review.warn.booking',
              message: 'This moves a booking, so the organiser confirms it with the supplier.',
            })}
            testID="plan-review-booking"
          />
        ) : null}
        {props.notice ? (
          <Notice text={noticeText(props.notice)} testID={`plan-review-${props.notice}`} />
        ) : null}
        <View style={styles.footer}>
          {props.vote ? (
            <>
              <Text variant="label" testID="plan-review-tally">
                {upper(
                  t({
                    id: 'plan.review.tally',
                    message: `${props.vote.yes} of ${props.vote.needed} yeses`,
                  }),
                  locale,
                )}
              </Text>
              {props.vote.canVote ? (
                <View style={styles.voteRow}>
                  <View style={{ flex: 1 }}>
                    <PillButton
                      label={t({ id: 'plan.review.no', message: 'Not this' })}
                      variant="secondary"
                      block
                      onPress={props.vote.onNo}
                      testID="plan-review-no"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PillButton
                      label={t({ id: 'plan.review.yes', message: 'Yes' })}
                      block
                      onPress={props.vote.onYes}
                      testID="plan-review-yes"
                    />
                  </View>
                </View>
              ) : props.vote.mine ? (
                <Text variant="bodySm" color={theme.semantic.text.secondary}>
                  {props.vote.mine === 'yes'
                    ? t({ id: 'plan.review.votedYes', message: 'You said yes.' })
                    : t({ id: 'plan.review.votedNo', message: 'You said not this.' })}
                </Text>
              ) : null}
            </>
          ) : null}
          {props.send ? (
            <PillButton
              label={props.send.label}
              block
              sheen
              disabled={props.send.disabled}
              loading={props.send.busy}
              onPress={props.send.onPress}
              testID="plan-review-send"
            />
          ) : null}
          {props.organiserApply ? (
            <InlineAction
              label={t({ id: 'plan.review.applyNow', message: 'Put it in now' })}
              onPress={props.organiserApply}
              testID="plan-review-apply-now"
            />
          ) : null}
          {props.personal ? (
            <InlineAction
              label={t({ id: 'plan.review.personal', message: 'Apply to my plan only' })}
              onPress={props.personal.onPress}
              disabled={props.personal.busy}
              testID="plan-review-personal"
            />
          ) : null}
        </View>
      </ScrollView>
    </Scaffold>
  );
}
