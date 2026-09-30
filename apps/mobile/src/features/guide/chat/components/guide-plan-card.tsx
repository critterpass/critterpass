/**
 * A plan card from the synced change set: PROPOSE TO GROUP sends it to the crew (`send_changeset`,
 * the vote lands in crew chat), JUST ME applies it to the asker's own day (`apply_changeset`,
 * personal). REVIEW opens the change review (3e-3). Until the change set syncs down the card
 * shows a short placeholder line.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router, type Href } from 'expo-router';

import { useCommand } from '@/data/commands/use-command';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { Text, useTheme } from '@/ui';

import { applyChangesetCommand, sendChangesetCommand } from '../data/guide-commands';
import { usePlanCard } from '../data/use-plan-card';
import { PlanCardView } from './plan-card';

export function reviewHref(tripId: string, changesetId: string): Href {
  return hrefFor('3e-3', { tripId, changesetId }) ?? (`/${tripId}/review/${changesetId}` as Href);
}

export function GuidePlanCard({
  changesetId,
  canPropose,
}: {
  readonly changesetId: string;
  readonly canPropose: boolean;
}) {
  const { t } = useLingui();
  const theme = useTheme();
  const model = usePlanCard(changesetId);
  const propose = useCommand(sendChangesetCommand);
  const apply = useCommand(applyChangesetCommand);
  if (model === null) {
    return (
      <Text variant="bodySm" color={theme.semantic.text.secondary} testID="guide-plan-pending">
        {t({ id: 'guide.plan.pending', message: 'Plan change on its way…' })}
      </Text>
    );
  }
  return (
    <PlanCardView
      model={model}
      canPropose={canPropose}
      busy={propose.pending || apply.pending}
      onPropose={() => void propose.send({ changeset_id: changesetId })}
      onJustMe={() => void apply.send({ changeset_id: changesetId, scope: 'personal' })}
      onReview={() => router.push(reviewHref(model.tripId, changesetId))}
    />
  );
}
