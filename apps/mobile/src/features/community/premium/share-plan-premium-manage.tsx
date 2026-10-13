/**
 * Share the plan's composer and the published plan's own page, premium: the preview, the
 * switches, Publish to crew plans and the read-only link; once live, its stats, the switches for
 * the asker and organisers, the links (each can be switched off), and unpublishing or taking one's
 * yes back. Each take-down asks first.
 */
import {
  DEFAULT_SHARED_PLAN_TOGGLES,
  type SharedPlanToggles,
  type TripSharedPlan,
} from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { useLocale } from '@/lib/i18n/use-locale';
import { Banner, Button, StatusTag, TextButton, usePremiumTheme } from '@/ui/premium';

import {
  publishSharedPlan,
  revokePlanLink,
  unpublishSharedPlan,
  updateSharedPlan,
  withdrawPublishConsent,
} from '../commands';
import { copiesLabel, ratingLabel } from '../copy';
import { canManage } from '../publish/publish-model';
import { linkDate, type Confirming } from '../publish/take-down';
import { useLinkCopy } from '../publish/use-link-copy';
import { usePublishAction } from '../publish/use-publish-action';
import { PreviewPremium, TogglesPremium, useConfirmTakeDown } from './share-plan-premium-parts';

export function ComposePremium({
  tripId,
  data,
  after,
  onChanged,
}: {
  readonly tripId: string;
  readonly data: TripSharedPlan;
  readonly after: 'declined' | 'unpublished' | null;
  readonly onChanged: () => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const [toggles, setToggles] = useState<SharedPlanToggles>(
    data.plan?.toggles ?? DEFAULT_SHARED_PLAN_TOGGLES,
  );
  const { send } = useCommand(publishSharedPlan);
  const action = usePublishAction(onChanged);
  const copyLink = useLinkCopy(tripId);
  return (
    <View style={{ gap: th.space.gap16 }} testID="share-plan-compose">
      {after === 'declined' ? (
        <Banner
          tone="info"
          text={t({
            id: 'community.consent.declined',
            message: "Not everyone's in. The plan stays with the crew.",
          })}
          testID="share-plan-declined"
        />
      ) : null}
      <PreviewPremium data={data} toggles={toggles} />
      <TogglesPremium
        toggles={toggles}
        onChange={setToggles}
        photos={data.skeleton?.photo_keys.length ?? 0}
      />
      <Button
        loading={action.busy}
        label={t({ id: 'community.publish.cta', message: 'Publish to crew plans' })}
        onPress={() =>
          action.run(
            () => send({ trip_id: tripId, toggles }),
            t({
              id: 'community.publish.asked',
              message: 'Asked. It goes out when everyone in the crew agrees.',
            }),
          )
        }
        testID="share-plan-publish"
      />
      <TextButton
        label={t({ id: 'community.publish.link', message: 'Copy a read-only link instead' })}
        align="center"
        disabled={action.busy}
        onPress={() => void copyLink()}
        testID="share-plan-link"
      />
    </View>
  );
}

export function PublishedPremium({
  tripId,
  data,
  plan,
  onChanged,
}: {
  readonly tripId: string;
  readonly data: TripSharedPlan;
  readonly plan: NonNullable<TripSharedPlan['plan']>;
  readonly onChanged: () => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const planId = plan.id;
  const manage = canManage(data);
  const [toggles, setToggles] = useState(plan.toggles);
  const { send: update } = useCommand(updateSharedPlan);
  const { send: unpublish } = useCommand(unpublishSharedPlan);
  const { send: withdraw } = useCommand(withdrawPublishConsent);
  const { send: revoke } = useCommand(revokePlanLink);
  const action = usePublishAction(onChanged);
  const copyLink = useLinkCopy(tripId);
  const card = { rating_avg: plan.rating_avg, rating_count: plan.rating_count };
  const live = data.links.filter((link) => link.revoked_at === null);
  const confirmTakeDown = useConfirmTakeDown();
  const ask = (confirming: Confirming) =>
    void confirmTakeDown(confirming).then((yes) => {
      if (!yes) return;
      if (confirming.kind === 'revoke') {
        action.run(
          () => revoke({ link_id: confirming.linkId }),
          t({ id: 'community.published.revoked', message: 'That link is off.' }),
        );
        return;
      }
      action.run(
        () =>
          confirming.kind === 'unpublish'
            ? unpublish({ shared_plan_id: planId })
            : withdraw({ shared_plan_id: planId }),
        t({
          id: 'community.published.unpublished',
          message: 'Taken down. Other crews no longer see it.',
        }),
      );
    });
  return (
    <View style={{ gap: th.space.gap16 }} testID="share-plan-published">
      <Banner
        tone="success"
        text={t({ id: 'community.published.live', message: 'Your plan is live in crew plans.' })}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.gap6 }}>
        <StatusTag tone="unopened" label={copiesLabel(plan.copies_count)} />
        <StatusTag
          tone="voteOpen"
          label={t({ id: 'community.published.saves', message: `${plan.saves_count} saves` })}
        />
        <StatusTag tone="maybe" label={ratingLabel(card)} />
      </View>
      <PreviewPremium data={data} toggles={toggles} />
      {manage ? (
        <TogglesPremium
          toggles={toggles}
          photos={data.skeleton?.photo_keys.length ?? 0}
          onChange={(next) => {
            setToggles(next);
            void update({ shared_plan_id: planId, toggles: next });
          }}
        />
      ) : null}
      <View style={{ gap: th.space.gap4, alignItems: 'flex-start' }}>
        <TextButton
          label={t({ id: 'community.published.link', message: 'Copy a read-only link' })}
          onPress={() => void copyLink()}
          testID="share-plan-link"
        />
        {live.map((link) => {
          const made = linkDate(link.created_at, locale);
          return (
            <TextButton
              key={link.id}
              tone="muted"
              label={t({
                id: 'community.published.revokeDated',
                message: `Turn off the link made ${made}`,
              })}
              disabled={action.busy}
              onPress={() => ask({ kind: 'revoke', linkId: link.id, made })}
              testID={`share-plan-revoke-${link.id}`}
            />
          );
        })}
      </View>
      {manage ? (
        <Button
          variant="destructive"
          label={t({ id: 'community.published.unpublish', message: 'Unpublish' })}
          loading={action.busy}
          onPress={() => ask({ kind: 'unpublish' })}
          testID="share-plan-unpublish"
        />
      ) : (
        <TextButton
          label={t({ id: 'community.consent.withdraw', message: 'Take my yes back' })}
          align="center"
          disabled={action.busy}
          onPress={() => ask({ kind: 'withdraw' })}
          testID="share-plan-withdraw"
        />
      )}
    </View>
  );
}
