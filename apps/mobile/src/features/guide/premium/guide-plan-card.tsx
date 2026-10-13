/**
 * The guide's plan card (5.14): a line in the guide's hand, each swap as what goes (struck
 * through, with its time) and what comes in, a driver the crew is asked to pick, the cost row
 * ("+$22 each"), then Propose to group (a vote in crew chat) and Just me (the asker's own day).
 * Review opens the full change review. Once sent or applied the card says so. It rises in when its
 * change set lands.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { driverPickDetail } from '@/features/drivers';
import { planRoutes, useChangesetActions } from '@/features/plan';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  Text,
  TextButton,
  makePremiumStyles,
  usePremiumReducedMotion,
  usePremiumTheme,
  riseIn,
} from '@/ui/premium';

import { costLine, outcomeOf } from '../chat/data/use-plan-card';
import { usePlanCard, type PlanSwap } from '../chat/data/use-plan-card';

const useStyles = makePremiumStyles((th) => ({
  card: {
    borderRadius: 24,
    padding: 14,
    gap: th.space.gap12,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.raised,
  },
  divider: { height: th.size.hairline, backgroundColor: th.color.hairline },
  cost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: th.color.ground,
  },
  actions: { flexDirection: 'row', gap: th.space.gap8 },
}));

function SwapLines({ swap }: { readonly swap: PlanSwap }) {
  const before =
    swap.before === null
      ? null
      : [
          swap.before.time,
          swap.before.label === ''
            ? t({ id: 'guide.plan.anItem', message: 'A plan item' })
            : swap.before.label,
        ]
          .filter(Boolean)
          .join(' ');
  const after =
    swap.after === null
      ? t({ id: 'guide.plan.removed', message: 'Taken out of the plan' })
      : swap.after.label === ''
        ? t({ id: 'guide.plan.newItem', message: 'Something new' })
        : swap.after.label;
  return (
    <View style={{ gap: 3 }}>
      {before === null ? null : (
        <Text
          variant="captionMuted"
          tone="placeholder"
          style={{ textDecorationLine: 'line-through' }}
        >
          {before}
        </Text>
      )}
      <Text variant="rowTitle">
        {swap.after?.time == null ? after : `${swap.after.time} ${after}`}
      </Text>
      {swap.reason === '' ? null : (
        <Text variant="captionMuted" tone="muted">
          {swap.reason}
        </Text>
      )}
    </View>
  );
}

export function PremiumGuidePlanCard({
  tripId,
  changesetId,
  canPropose,
}: {
  readonly tripId: string | null;
  readonly changesetId: string;
  readonly canPropose: boolean;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const locale = useLocale();
  const reduced = usePremiumReducedMotion();
  const model = usePlanCard(tripId, changesetId);
  const actions = useChangesetActions(changesetId);
  const [busy, setBusy] = useState(false);
  if (model === null) {
    return (
      <Text variant="captionMuted" tone="muted" testID="guide-plan-pending">
        {t({ id: 'guide.plan.pending', message: 'Plan change on its way…' })}
      </Text>
    );
  }
  const run = (action: () => Promise<unknown>) => {
    setBusy(true);
    void action().finally(() => setBusy(false));
  };
  const outcome = outcomeOf(model.state);
  const cost = costLine(model, locale);
  const lines = [
    ...model.swaps.map((swap, index) => ({
      key: `${swap.target}-${index}`,
      node: <SwapLines swap={swap} />,
    })),
    ...model.driverPicks.map((pick) => ({
      key: pick.target,
      node: (
        <View style={{ gap: 3 }}>
          <Text variant="rowTitle">
            {pick.name === '' ? t({ id: 'guide.plan.driver', message: 'A driver' }) : pick.name}
          </Text>
          <Text variant="captionMuted" tone="muted">
            {driverPickDetail(pick, locale)}
          </Text>
        </View>
      ),
    })),
  ];
  return (
    <Animated.View
      entering={riseIn(reduced)}
      style={styles.card}
      testID={`guide-plan-card-${model.changesetId}`}
    >
      {lines.map((line, index) => (
        <View key={line.key} style={{ gap: th.space.gap12 }}>
          {index === 0 ? null : <View style={styles.divider} />}
          {line.node}
        </View>
      ))}
      <View style={styles.cost}>
        <Text variant="rowTextStrong">
          {cost === null
            ? t({ id: 'guide.plan.noCost', message: 'No change to what each pays' })
            : t({ id: 'guide.plan.cost', message: `${cost} each` })}
        </Text>
        <TextButton
          label={t({ id: 'guide.plan.review', message: 'Review' })}
          onPress={() => router.push(planRoutes.review(model.tripId, changesetId))}
          testID="guide-plan-review"
        />
      </View>
      {outcome === 'open' ? (
        <View style={styles.actions}>
          {canPropose ? (
            <View style={{ flex: 1.4 }}>
              <Button
                size="small"
                label={t({ id: 'guide.plan.propose', message: 'Propose to group' })}
                onPress={() => run(actions.send)}
                disabled={busy}
                testID="guide-plan-propose"
              />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button
              size="small"
              variant={canPropose ? 'control' : 'primary'}
              label={t({ id: 'guide.plan.justMe', message: 'Just me' })}
              onPress={() => run(actions.applyPersonal)}
              disabled={busy}
              testID="guide-plan-just-me"
            />
          </View>
        </View>
      ) : (
        <Text variant="rowTextStrong" testID="guide-plan-outcome">
          {outcome === 'sent'
            ? t({ id: 'guide.plan.sent', message: 'Sent to the crew chat as a vote' })
            : outcome === 'applied'
              ? t({ id: 'guide.plan.applied', message: 'In the plan' })
              : t({ id: 'guide.plan.closed', message: 'This change is no longer open' })}
        </Text>
      )}
    </Animated.View>
  );
}
