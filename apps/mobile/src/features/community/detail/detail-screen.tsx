/**
 * A shared plan (3o-2): the hero with ♡ SAVE and the plan's chips, the guide's overlap note against
 * this crew's trip (numbers from the server, words here), DAY BY DAY with "+" to take one day, the
 * crew's tips, and COPY INTO OUR TRIP / DAY {best} ONLY. Only an organiser copies; anyone else
 * suggests it to them. An unpublished plan shows a tombstone.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { EmptyState } from '@/ui/states/EmptyState';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { makeStyles } from '@/ui/theme';

import { dataOf, useSharedPlan } from '../api';
import { PlanView } from './plan-view';

const useStyles = makeStyles((th) => ({
  content: { paddingHorizontal: th.size.gutter, gap: th.space['16'] },
}));

export interface SharedPlanScreenProps {
  readonly sharedPlanId: string;
  readonly tripId: string | null;
}

export function SharedPlanScreen({ sharedPlanId, tripId }: SharedPlanScreenProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const { state, reload } = useSharedPlan(sharedPlanId);
  const detail = dataOf(state);
  const guide = guideSticker(null);
  if (detail === null) {
    return (
      <Scaffold testID="shared-plan">
        <View style={styles.content}>
          <BackEyebrow label={t({ id: 'community.back.plans', message: 'Crew plans' })} />
          {state.status === 'loading' ? (
            <Skeleton preset="card" repeat={2} />
          ) : (
            <EmptyState
              guide="tokek"
              guideName={guide.name}
              title={t({ id: 'community.detail.missing', message: 'This plan is out of reach' })}
              line={t({
                id: 'community.detail.missingLine',
                message: 'It needs a signal the first time.',
              })}
              action={{
                label: t({ id: 'community.retry', message: 'Try again' }),
                onPress: reload,
              }}
            />
          )}
        </View>
      </Scaffold>
    );
  }
  if (detail.status === 'unpublished' || detail.projection === null) {
    return (
      <Scaffold testID="shared-plan-tombstone">
        <View style={styles.content}>
          <BackEyebrow label={t({ id: 'community.back.plans', message: 'Crew plans' })} />
          <EmptyState
            guide="tokek"
            guideName={guide.name}
            title={t({ id: 'community.detail.gone', message: 'This plan was taken down' })}
            line={t({
              id: 'community.detail.goneLine',
              message: 'Its crew stopped sharing it. Plenty more where it came from.',
            })}
          />
        </View>
      </Scaffold>
    );
  }
  return <PlanView detail={detail} tripId={tripId} onChanged={reload} />;
}
