/**
 * A plan card from the plan area's change review: PROPOSE TO GROUP sends the change set to the
 * crew (the vote lands in crew chat), JUST ME applies it to the asker's own day (personal), and
 * REVIEW opens the full change review (3e-3). Until the change set syncs down the card shows a
 * short placeholder line.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { planRoutes, useChangesetActions } from '@/features/plan';
import { Text, useTheme } from '@/ui';

import { usePlanCard } from '../data/use-plan-card';
import { PlanCardView } from './plan-card';

export function GuidePlanCard({
  tripId,
  changesetId,
  canPropose,
}: {
  readonly tripId: string | null;
  readonly changesetId: string;
  readonly canPropose: boolean;
}) {
  const { t } = useLingui();
  const theme = useTheme();
  const model = usePlanCard(tripId, changesetId);
  const actions = useChangesetActions(changesetId);
  const [busy, setBusy] = useState(false);
  if (model === null) {
    return (
      <Text variant="bodySm" color={theme.semantic.text.secondary} testID="guide-plan-pending">
        {t({ id: 'guide.plan.pending', message: 'Plan change on its way…' })}
      </Text>
    );
  }
  const run = (action: () => Promise<unknown>) => {
    setBusy(true);
    void action().finally(() => setBusy(false));
  };
  return (
    <PlanCardView
      model={model}
      canPropose={canPropose}
      busy={busy}
      onPropose={() => run(actions.send)}
      onJustMe={() => run(actions.applyPersonal)}
      onReview={() => router.push(planRoutes.review(model.tripId, changesetId))}
    />
  );
}
