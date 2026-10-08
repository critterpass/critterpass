/**
 * Share the plan (3o-4): the live preview "HOW OTHER CREWS WILL SEE IT", built on the phone with
 * the same projection the server publishes, the four toggles (the chat stays private), PUBLISH TO
 * CREW PLANS and "Copy a read-only link instead". The same screen carries the consent card for a
 * participant asked to agree, the waiting count, the decline, and the published plan's own page
 * (stats, toggles, unpublish, links, and taking one's yes back).
 */
import { DEFAULT_SHARED_PLAN_TOGGLES, type TripSharedPlan } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCommand } from '@/data/commands/use-command';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { EmptyState } from '@/ui/states/EmptyState';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { dataOf, useTripSharedPlan } from '../api';
import { respondPublishConsent, withdrawPublishConsent } from '../commands';
import { publishFace } from './publish-model';
import { Compose, Published } from './publish-manage';
import { Preview } from './publish-parts';
import { usePublishAction } from './use-publish-action';

const useStyles = makeStyles((th) => ({
  content: { paddingHorizontal: th.size.gutter, gap: th.space['16'] },
  center: { alignItems: 'center' },
}));

export function SharePlanScreen({ tripId }: { tripId: string }) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { state, reload } = useTripSharedPlan(tripId);
  const data = dataOf(state);
  return (
    <Scaffold testID="share-plan">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: theme.space['12'], paddingBottom: insets.bottom + theme.space['24'] },
        ]}
      >
        <BackEyebrow label={t({ id: 'community.back.trip', message: 'Trip' })} />
        <Text variant="displayHero" accessibilityRole="header">
          {t({ id: 'community.publish.title', message: 'Share the plan' })}
        </Text>
        {data === null ? (
          state.status === 'loading' ? (
            <Skeleton preset="card" />
          ) : (
            <EmptyState
              guide="tokek"
              guideName={guideSticker(null).name}
              title={t({ id: 'community.publish.offline', message: 'Sharing needs a signal' })}
              line={t({
                id: 'community.publish.offlineLine',
                message: 'Try again when you are back online.',
              })}
              action={{
                label: t({ id: 'community.retry', message: 'Try again' }),
                onPress: reload,
              }}
            />
          )
        ) : (
          <Faces tripId={tripId} data={data} onChanged={reload} />
        )}
      </ScrollView>
    </Scaffold>
  );
}

function Faces({
  tripId,
  data,
  onChanged,
}: {
  tripId: string;
  data: TripSharedPlan;
  onChanged: () => void;
}) {
  const { t } = useLingui();
  const face = publishFace(data);
  const { send: respond } = useCommand(respondPublishConsent);
  const { send: withdraw } = useCommand(withdrawPublishConsent);
  const action = usePublishAction(onChanged);
  switch (face.kind) {
    case 'no_plan':
      return (
        <Text variant="body" testID="share-plan-no-plan">
          {t({
            id: 'community.publish.noPlan',
            message: 'Once the trip has a plan, you can share it here.',
          })}
        </Text>
      );
    case 'consent':
      return (
        <Stack gap="12" testID="share-plan-consent">
          <Preview data={data} toggles={data.plan?.toggles ?? DEFAULT_SHARED_PLAN_TOGGLES} />
          <Text variant="body">
            {t({
              id: 'community.consent.ask',
              message:
                'Someone in the crew wants to share this plan with other crews. It only goes out if everyone agrees.',
            })}
          </Text>
          <PillButton
            tone="yellow"
            block
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
          <PillButton
            variant="secondary"
            block
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
        </Stack>
      );
    case 'waiting':
      return (
        <Stack gap="12" testID="share-plan-waiting">
          <Preview data={data} toggles={data.plan?.toggles ?? DEFAULT_SHARED_PLAN_TOGGLES} />
          <Text variant="body">
            {t({
              id: 'community.consent.waiting',
              message: `${face.approved} of ${face.total} in. It goes out when everyone agrees.`,
            })}
          </Text>
          <TextLink
            label={t({ id: 'community.consent.withdraw', message: 'Take my yes back' })}
            disabled={action.busy}
            onPress={() =>
              action.run(
                () => withdraw({ shared_plan_id: face.planId }),
                t({ id: 'community.consent.withdrawn', message: 'Your yes is taken back.' }),
              )
            }
            testID="share-plan-withdraw"
          />
        </Stack>
      );
    case 'published':
      return data.plan === null ? null : (
        <Published tripId={tripId} data={data} plan={data.plan} onChanged={onChanged} />
      );
    case 'compose':
      return <Compose tripId={tripId} data={data} after={face.after} onChanged={onChanged} />;
  }
}
