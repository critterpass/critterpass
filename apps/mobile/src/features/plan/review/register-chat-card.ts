/**
 * The change set's registration in crew chat: sending a change set for a vote posts a `changeset`
 * message, drawn as the change set's card. The message names the change set; its trip comes from
 * the synced change set row.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { t } from '@lingui/core/macro';
import { createElement } from 'react';

import { registerChatCard, type ChatCardProps } from '@/features/crew';
import { Skeleton } from '@/ui/states/Skeleton';

import { useLiveRows } from '../overview/data/live-rows';
import { ChangesetChatCard } from './changeset-chat-card';

const TRIP_SQL = 'SELECT trip_id FROM change_sets WHERE id = ?';

function ChangesetMessageCard({ message }: ChatCardProps) {
  const changesetId = message.refId;
  const { rows } = useLiveRows<{ trip_id: string }>(
    TRIP_SQL,
    changesetId === null ? null : [changesetId],
    ['change_sets'],
  );
  const tripId = rows[0]?.trip_id;
  if (changesetId === null || tripId === undefined) {
    return createElement(Skeleton, {
      preset: 'card',
      label: t({ id: 'plan.card.loading', message: 'Loading the plan change' }),
    });
  }
  return createElement(ChangesetChatCard, { tripId, changesetId });
}

registerChatCard('changeset', {
  Component: ChangesetMessageCard,
  estimateHeight: () => 180,
  a11yLabel: () => t({ id: 'plan.card.label', message: 'Plan change' }),
});
