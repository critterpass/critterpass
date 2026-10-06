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
  const { send, pending } = useCommand(publishSharedPlan);
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
        loading={pending}
        label={t({ id: 'community.publish.cta', message: 'Publish to crew plans' })}
        onPress={() => void send({ trip_id: tripId, toggles }).then(onChanged)}
        testID="share-plan-publish"
      />
      <View style={CENTER}>
        <TextLink
          label={t({ id: 'community.publish.link', message: 'Copy a read-only link instead' })}
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
        label={t({ id: 'community.publish.link', message: 'Copy a read-only link instead' })}
        onPress={() => void copyLink()}
        testID="share-plan-link"
      />
      {live.map((link) => (
        <TextLink
          key={link.id}
          label={t({ id: 'community.published.revoke', message: 'Turn off a read-only link' })}
          onPress={() => void revoke({ link_id: link.id }).then(onChanged)}
          testID={`share-plan-revoke-${link.id}`}
        />
      ))}
      {manage ? (
        <PillButton
          variant="destructive"
          block
          label={t({ id: 'community.published.unpublish', message: 'Unpublish' })}
          onPress={() => void unpublish({ shared_plan_id: planId }).then(onChanged)}
          testID="share-plan-unpublish"
        />
      ) : (
        <TextLink
          label={t({ id: 'community.consent.withdraw', message: 'Take my yes back' })}
          onPress={() => void withdraw({ shared_plan_id: planId }).then(onChanged)}
          testID="share-plan-withdraw"
        />
      )}
    </Stack>
  );
}
