/**
 * Share the plan, premium: pushed from the plan with the glass back. One page carries every face:
 * the composer, the consent card for a participant asked to agree, the waiting count with taking
 * one's yes back, and the published plan's own page. Offline it says sharing needs a signal.
 */
import { DEFAULT_SHARED_PLAN_TOGGLES, type TripSharedPlan } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useCommand } from '@/data/commands/use-command';
import { guideSticker } from '@/ui/avatar/guides';
import {
  Button,
  EmptyState,
  enterTransition,
  GuideNote,
  Skeleton,
  Text,
  TextButton,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { dataOf, useTripSharedPlan } from '../api';
import { respondPublishConsent, withdrawPublishConsent } from '../commands';
import { publishFace } from '../publish/publish-model';
import { usePublishAction } from '../publish/use-publish-action';
import { ComposePremium, PublishedPremium } from './share-plan-premium-manage';
import { PreviewPremium } from './share-plan-premium-parts';

/** The guide's sticker in the empty and loading states. */
const GECKO = guideSticker(null);

function Faces({
  tripId,
  data,
  onChanged,
}: {
  readonly tripId: string;
  readonly data: TripSharedPlan;
  readonly onChanged: () => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const face = publishFace(data);
  const { send: respond } = useCommand(respondPublishConsent);
  const { send: withdraw } = useCommand(withdrawPublishConsent);
  const action = usePublishAction(onChanged);
  const toggles = data.plan?.toggles ?? DEFAULT_SHARED_PLAN_TOGGLES;
  switch (face.kind) {
    case 'no_plan':
      return (
        <Text variant="body" tone="muted" testID="share-plan-no-plan">
          {t({
            id: 'community.publish.noPlan',
            message: 'Once the trip has a plan, you can share it here.',
          })}
        </Text>
      );
    case 'consent':
      return (
        <View style={{ gap: th.space.gap12 }} testID="share-plan-consent">
          <PreviewPremium data={data} toggles={toggles} />
          <GuideNote
            name={GECKO.name}
            text={t({
              id: 'community.consent.ask',
              message:
                'Someone in the crew wants to share this plan with other crews. It only goes out if everyone agrees.',
            })}
          />
          <Button
            label={t({ id: 'community.consent.approve', message: 'Approve' })}
            disabled={action.busy}
            onPress={() =>
              action.run(
                () => respond({ shared_plan_id: face.planId, approve: true }),
                t({ id: 'community.consent.approved', message: "You're in." }),
              )
            }
            testID="share-plan-approve"
          />
          <Button
            variant="secondary"
            label={t({ id: 'community.consent.decline', message: 'Not this one' })}
            disabled={action.busy}
            onPress={() =>
              action.run(
                () => respond({ shared_plan_id: face.planId, approve: false }),
                t({
                  id: 'community.consent.declinedDone',
                  message: 'Declined. The plan stays with the crew.',
                }),
              )
            }
            testID="share-plan-decline"
          />
        </View>
      );
    case 'waiting':
      return (
        <View style={{ gap: th.space.gap12 }} testID="share-plan-waiting">
          <PreviewPremium data={data} toggles={toggles} />
          <Text variant="body" tone="inkSecondary">
            {t({
              id: 'community.consent.waiting',
              message: `${face.approved} of ${face.total} in. It goes out when everyone agrees.`,
            })}
          </Text>
          <TextButton
            label={t({ id: 'community.consent.withdraw', message: 'Take my yes back' })}
            align="center"
            disabled={action.busy}
            onPress={() =>
              action.run(
                () => withdraw({ shared_plan_id: face.planId }),
                t({ id: 'community.consent.withdrawn', message: 'Your yes is taken back.' }),
              )
            }
            testID="share-plan-withdraw"
          />
        </View>
      );
    case 'published':
      return data.plan === null ? null : (
        <PublishedPremium tripId={tripId} data={data} plan={data.plan} onChanged={onChanged} />
      );
    case 'compose':
      return (
        <ComposePremium tripId={tripId} data={data} after={face.after} onChanged={onChanged} />
      );
  }
}

export function SharePlanPremiumScreen({ tripId }: { readonly tripId: string }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const reduced = usePremiumReducedMotion();
  const { state, reload } = useTripSharedPlan(tripId);
  const data = dataOf(state);
  const title = t({ id: 'community.publish.title', message: 'Share the plan' });
  return (
    <PushScreen
      title={title}
      backLabel={t({ id: 'community.back.trip', message: 'Trip' })}
      testID="share-plan"
    >
      <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap16 }}>
        <Text variant="largeTitle" accessibilityRole="header">
          {title}
        </Text>
        {data === null ? (
          state.status === 'loading' ? (
            <View style={{ gap: th.space.gap12 }}>
              <Skeleton height={180} tone="block" radius={th.radius.cardLarge} />
              <Skeleton height={200} tone="soft" radius={th.radius.card} />
            </View>
          ) : (
            <EmptyState
              critter={GECKO}
              check={false}
              title={t({ id: 'community.publish.offline', message: 'Sharing needs a signal' })}
              line={t({
                id: 'community.publish.offlineLine',
                message: 'Try again when you are back online.',
              })}
              action={
                <Button
                  label={t({ id: 'community.retry', message: 'Try again' })}
                  variant="secondary"
                  size="medium"
                  onPress={reload}
                />
              }
            />
          )
        ) : (
          <Animated.View entering={enterTransition(reduced)}>
            <Faces tripId={tripId} data={data} onChanged={reload} />
          </Animated.View>
        )}
      </View>
    </PushScreen>
  );
}
