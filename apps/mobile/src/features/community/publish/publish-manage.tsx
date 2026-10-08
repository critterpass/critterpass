/**
 * Share the plan's composer (nothing shared yet, or the last ask was declined or taken down) and
 * the published plan's own page: stats, toggles for the asker and organisers, links, and
 * unpublishing or taking one's yes back.
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
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';

import {
  publishSharedPlan,
  revokePlanLink,
  unpublishSharedPlan,
  updateSharedPlan,
  withdrawPublishConsent,
} from '../commands';
import { copiesLabel, ratingLabel } from '../copy';
import { Preview, Toggles, useLinkCopy } from './publish-parts';
import { canManage } from './publish-model';
import { ConfirmTakeDown, linkDate, type Confirming } from './take-down-confirm';
import { usePublishAction } from './use-publish-action';

const CENTER = { alignItems: 'center' } as const;

export function Compose({
  tripId,
  data,
  after,
  onChanged,
}: {
  tripId: string;
  data: TripSharedPlan;
  after: 'declined' | 'unpublished' | null;
  onChanged: () => void;
}) {
  const { t } = useLingui();
  const [toggles, setToggles] = useState<SharedPlanToggles>(
    data.plan?.toggles ?? DEFAULT_SHARED_PLAN_TOGGLES,
  );
  const { send } = useCommand(publishSharedPlan);
  const action = usePublishAction(onChanged);
  const copyLink = useLinkCopy(tripId);
  return (
    <Stack gap="16" testID="share-plan-compose">
      {after === 'declined' ? (
        <Text variant="body" testID="share-plan-declined">
          {t({
            id: 'community.consent.declined',
            message: "Not everyone's in. The plan stays with the crew.",
          })}
        </Text>
      ) : null}
      <Preview data={data} toggles={toggles} />
      <Toggles
        toggles={toggles}
        onChange={setToggles}
        photos={data.skeleton?.photo_keys.length ?? 0}
      />
      <PillButton
        tone="yellow"
        block
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
      <View style={CENTER}>
        <TextLink
          label={t({ id: 'community.publish.link', message: 'Copy a read-only link instead' })}
          disabled={action.busy}
          onPress={() => void copyLink()}
          testID="share-plan-link"
        />
      </View>
    </Stack>
  );
}

export function Published({
  tripId,
  data,
  plan,
  onChanged,
}: {
  tripId: string;
  data: TripSharedPlan;
  plan: NonNullable<TripSharedPlan['plan']>;
  onChanged: () => void;
}) {
  const { t } = useLingui();
  const planId = plan.id;
  const manage = canManage(data);
  const [toggles, setToggles] = useState(plan.toggles);
  const { send: update } = useCommand(updateSharedPlan);
  const { send: unpublish } = useCommand(unpublishSharedPlan);
  const { send: withdraw } = useCommand(withdrawPublishConsent);
  const { send: revoke } = useCommand(revokePlanLink);
  const action = usePublishAction(onChanged);
  const locale = useLocale();
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const copyLink = useLinkCopy(tripId);
  const card = { rating_avg: plan.rating_avg, rating_count: plan.rating_count };
  const live = data.links.filter((link) => link.revoked_at === null);
  return (
    <Stack gap="16" testID="share-plan-published">
      <Text variant="body">
        {t({ id: 'community.published.live', message: 'Your plan is live in crew plans.' })}
      </Text>
      <Row gap="6" wrap>
        <InfoPill>{copiesLabel(plan.copies_count)}</InfoPill>
        <InfoPill>
          {t({ id: 'community.published.saves', message: `${plan.saves_count} saves` })}
        </InfoPill>
        <InfoPill>{ratingLabel(card)}</InfoPill>
      </Row>
      <Preview data={data} toggles={toggles} />
      {manage ? (
        <Toggles
          toggles={toggles}
          photos={data.skeleton?.photo_keys.length ?? 0}
          onChange={(next) => {
            setToggles(next);
            void update({ shared_plan_id: planId, toggles: next });
          }}
        />
      ) : null}
      <TextLink
        label={t({ id: 'community.published.link', message: 'Copy a read-only link' })}
        onPress={() => void copyLink()}
        testID="share-plan-link"
      />
      {live.map((link) => {
        const made = linkDate(link.created_at, locale);
        return (
          <TextLink
            key={link.id}
            label={t({
              id: 'community.published.revokeDated',
              message: `Turn off the link made ${made}`,
            })}
            disabled={action.busy}
            onPress={() => setConfirming({ kind: 'revoke', linkId: link.id, made })}
            testID={`share-plan-revoke-${link.id}`}
          />
        );
      })}
      {manage ? (
        <PillButton
          variant="destructive"
          block
          label={t({ id: 'community.published.unpublish', message: 'Unpublish' })}
          loading={action.busy}
          onPress={() => setConfirming({ kind: 'unpublish' })}
          testID="share-plan-unpublish"
        />
      ) : (
        <TextLink
          label={t({ id: 'community.consent.withdraw', message: 'Take my yes back' })}
          disabled={action.busy}
          onPress={() => setConfirming({ kind: 'withdraw' })}
          testID="share-plan-withdraw"
        />
      )}
      {confirming === null ? null : (
        <ConfirmTakeDown
          confirming={confirming}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null);
            if (confirming.kind === 'revoke') {
              action.run(
                () => revoke({ link_id: confirming.linkId }),
                t({ id: 'community.published.revoked', message: 'That link is off.' }),
              );
            } else {
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
            }
          }}
        />
      )}
    </Stack>
  );
}
