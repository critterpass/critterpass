/**
 * A plan change in the premium crew chat (message type `changeset`; undesigned, built from the
 * card, the status tag and the buttons): what the change is in a sentence ("Minh wants to add Bà
 * Nà Hills, Wed 07:00"), where the vote stands, yes / not this for someone it touches who hasn't
 * answered, and the full review, which the whole card opens.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and table names, never copy. */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import type { ChatCardProps } from '@/features/crew';
import { driverPickDetail } from '@/features/drivers';
import { useLiveRows } from '@/data/plan/live-rows';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  Skeleton,
  StatusTag,
  Text,
  TextButton,
  usePremiumTheme,
  type StatusTone,
} from '@/ui/premium';
import { memberFirstName } from '@/ui/people/member-name';

import { planRoutes } from '../../overview/routes';
import { changeTitle, stateWord } from '../../review/chat-card-title';
import { useChangeset, useChangesetActions } from '../../review/data/use-changeset';
import type { ChangesetState } from '../../review/model/review-model';

const TRIP_SQL = 'SELECT trip_id FROM change_sets WHERE id = ?';

function toneOf(state: ChangesetState): StatusTone {
  if (state === 'voting') return 'voteOpen';
  if (state === 'approved' || state === 'applying') return 'booked';
  if (state === 'stale') return 'maybe';
  return 'unopened';
}

function ChangeCard({
  tripId,
  changesetId,
}: {
  readonly tripId: string;
  readonly changesetId: string;
}) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const view = useChangeset(tripId, changesetId);
  const actions = useChangesetActions(changesetId);
  if (view.status !== 'ready') return null;
  const uid = view.plan.uid ?? '';
  const tally = view.tally;
  const answered = tally !== null && (tally.yes.includes(uid) || tally.no.includes(uid));
  const canVote =
    view.state === 'voting' && tally !== null && tally.eligible.includes(uid) && !answered;
  const byGuide = view.row?.author_kind !== 'user';
  const author = view.plan.members.find((m) => m.user_id === view.row?.author_id);
  const dayLabel = (dayNo: number): string | null => {
    const date = view.days.find((day) => day.dayNo === dayNo)?.date ?? null;
    // Midday UTC keeps the calendar date in every zone.
    return date === null
      ? null
      : new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
          new Date(`${date}T12:00:00Z`),
        );
  };
  const kept = view.cards.filter((card) => card.accepted);
  const pick = kept.length === 1 ? (kept[0]?.driverPick ?? null) : null;
  const detail = pick === null ? null : driverPickDetail(pick, locale);
  const title = changeTitle({
    cards: view.cards,
    trigger: view.row?.trigger ?? null,
    author: byGuide ? null : memberFirstName(author?.display_name ?? null),
    mine: view.mine,
    dayLabel,
  });
  const open = () => router.push(planRoutes.review(tripId, changesetId));
  return (
    // The whole card opens the review. It is not one accessible element: the answers and the
    // link inside it stay reachable on their own.
    <Pressable
      onPress={open}
      accessible={false}
      testID={`changeset-card-${changesetId}`}
      style={{
        padding: 14,
        gap: theme.space.gap8,
        borderRadius: 24,
        backgroundColor: theme.color.card,
        boxShadow: theme.shadow.raised,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap8 }}>
        <Text variant="label" tone="muted" style={{ flex: 1 }}>
          {t({ id: 'plan.card.eyebrow', message: 'Plan change' })}
        </Text>
        <StatusTag tone={toneOf(view.state)} label={stateWord(view.state)} />
      </View>
      <Text variant="headline">{title}</Text>
      {detail ? (
        <Text variant="note" testID="changeset-card-detail">
          {detail}
        </Text>
      ) : null}
      {view.state === 'voting' ? (
        <Text variant="captionMuted" tone="muted">
          {t({
            id: 'plan.card.tally',
            message: `${tally?.yes.length ?? 0} of ${tally?.needed ?? 0} yeses so far`,
          })}
        </Text>
      ) : null}
      {canVote ? (
        <View style={{ flexDirection: 'row', gap: theme.space.gap8 }}>
          <View style={{ flex: 1 }}>
            <Button
              size="small"
              variant="secondary"
              label={t({ id: 'plan.card.no', message: 'Not this' })}
              onPress={() => void actions.decide('no')}
              testID="changeset-card-no"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              size="small"
              label={t({ id: 'plan.card.yes', message: 'Yes' })}
              onPress={() => void actions.decide('yes')}
              testID="changeset-card-yes"
            />
          </View>
        </View>
      ) : null}
      <TextButton label={t({ id: 'plan.card.open', message: 'See the changes' })} onPress={open} />
    </Pressable>
  );
}

/** The card for a `changeset` message: the trip comes from the synced change set row. */
export function PremiumChangesetCard({ message }: Pick<ChatCardProps, 'message'>) {
  const changesetId = message.refId;
  const { rows } = useLiveRows<{ trip_id: string }>(
    TRIP_SQL,
    changesetId === null ? null : [changesetId],
    ['change_sets'],
  );
  const tripId = rows[0]?.trip_id;
  if (changesetId === null || tripId === undefined) {
    return (
      <View
        accessible
        accessibilityLabel={t({ id: 'plan.card.loading', message: 'Loading the plan change' })}
      >
        <Skeleton height={140} radius={24} tone="block" />
      </View>
    );
  }
  return <ChangeCard tripId={tripId} changesetId={changesetId} />;
}
