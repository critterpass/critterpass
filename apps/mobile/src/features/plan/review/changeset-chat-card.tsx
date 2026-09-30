/**
 * The change set's card in crew chat (message type `changeset`): what it is, where the vote
 * stands (voting, approved, rejected, expired, stale), yes / not this for the people it touches,
 * and a way into the full review. Exported for the chat renderer and the guide chat.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { TextLink } from '@/ui/buttons/TextLink';
import { PillButton } from '@/ui/buttons/PillButton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { planRoutes } from '../overview/routes';
import { useChangeset, useChangesetActions } from './data/use-changeset';
import type { ChangesetState } from './model/review-model';
import { reviewTitle } from './review-copy';

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    gap: th.space['8'],
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chip: {
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['2'],
  },
  actions: { flexDirection: 'row', gap: th.space['8'] },
}));

export function stateWord(state: ChangesetState): string {
  switch (state) {
    case 'draft':
      return t({ id: 'plan.card.state.draft', message: 'Not sent' });
    case 'voting':
      return t({ id: 'plan.card.state.voting', message: 'Voting' });
    case 'approved':
      return t({ id: 'plan.card.state.approved', message: 'Approved' });
    case 'applying':
      return t({ id: 'plan.card.state.applying', message: 'Approved' });
    case 'rejected':
      return t({ id: 'plan.card.state.rejected', message: 'Kept as is' });
    case 'expired':
      return t({ id: 'plan.card.state.expired', message: 'Ran out' });
    case 'stale':
      return t({ id: 'plan.card.state.stale', message: 'Out of date' });
  }
}

export interface ChangesetChatCardViewProps {
  readonly title: string;
  readonly state: ChangesetState;
  readonly yes: number;
  readonly needed: number;
  /** Yes / not this, for someone the change touches who hasn't answered. */
  readonly onDecide: ((decision: 'yes' | 'no') => void) | null;
  readonly onOpen: () => void;
  readonly testID?: string;
}

export function ChangesetChatCardView(props: ChangesetChatCardViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const chipColour =
    props.state === 'voting'
      ? theme.semantic.state.urgent
      : props.state === 'approved' || props.state === 'applying'
        ? theme.semantic.state.success
        : props.state === 'stale'
          ? theme.semantic.state.warning
          : theme.semantic.bg.control;
  const onAccent = chipColour !== theme.semantic.bg.control;
  const yes = props.yes;
  const needed = props.needed;
  return (
    <View style={styles.card} testID={props.testID}>
      <View style={styles.top}>
        <Text variant="eyebrow">
          {upper(t({ id: 'plan.card.eyebrow', message: 'Plan change' }), locale)}
        </Text>
        <View style={[styles.chip, { backgroundColor: chipColour }]}>
          <Text variant="label" color={onAccent ? theme.semantic.text.onAccent : undefined}>
            {upper(stateWord(props.state), locale)}
          </Text>
        </View>
      </View>
      <Text variant="title">{upper(props.title, locale)}</Text>
      {props.state === 'voting' ? (
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({ id: 'plan.card.tally', message: `${yes} of ${needed} yeses so far` })}
        </Text>
      ) : null}
      {props.onDecide ? (
        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <PillButton
              size="sm"
              variant="secondary"
              block
              label={t({ id: 'plan.card.no', message: 'Not this' })}
              onPress={() => props.onDecide?.('no')}
            />
          </View>
          <View style={{ flex: 1 }}>
            <PillButton
              size="sm"
              block
              label={t({ id: 'plan.card.yes', message: 'Yes' })}
              onPress={() => props.onDecide?.('yes')}
            />
          </View>
        </View>
      ) : null}
      <TextLink
        label={t({ id: 'plan.card.open', message: 'See the changes' })}
        onPress={props.onOpen}
      />
    </View>
  );
}

/** The chat card over the synced change set (`message.ref_id`). */
export function ChangesetChatCard({
  tripId,
  changesetId,
}: {
  readonly tripId: string;
  readonly changesetId: string;
}) {
  const view = useChangeset(tripId, changesetId);
  const actions = useChangesetActions(changesetId);
  const uid = view.plan.uid ?? '';
  const tally = view.tally;
  const answered = tally !== null && (tally.yes.includes(uid) || tally.no.includes(uid));
  const canVote =
    view.state === 'voting' && tally !== null && tally.eligible.includes(uid) && !answered;
  if (view.status !== 'ready') return null;
  return (
    <ChangesetChatCardView
      title={reviewTitle(view.row?.trigger ?? null, view.cards.length)}
      state={view.state}
      yes={tally?.yes.length ?? 0}
      needed={tally?.needed ?? 0}
      onDecide={canVote ? (decision) => void actions.decide(decision) : null}
      onOpen={() => router.push(planRoutes.review(tripId, changesetId))}
      testID={`changeset-card-${changesetId}`}
    />
  );
}
