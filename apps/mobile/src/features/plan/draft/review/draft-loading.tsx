/**
 * The private draft while it loads (undesigned; docs/undesigned-states.md): the review's own header,
 * so the way back shows from the first frame, over a skeleton in the day list's shape. A slow load
 * gets the trip guide's line once the trip is on the phone.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import { GuideLine, type GuideId } from '@/ui/people/GuideLine';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { makeStyles } from '@/ui/theme';

import { draftBackLabel } from '../back-label';

const useStyles = makeStyles((th) => ({
  header: {
    paddingHorizontal: th.space['20'],
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: th.space['32'] + th.space['12'],
  },
  content: { paddingHorizontal: th.space['20'], paddingTop: th.space['16'], gap: th.space['12'] },
}));

export interface DraftLoadingProps {
  /** Known once the trip row has synced; the back label and the slow hint need it. */
  readonly trip: { readonly destination: string; readonly guide: GuideId } | null;
  readonly onBack: () => void;
}

export function DraftLoading({ trip, onBack }: DraftLoadingProps) {
  const styles = useStyles();
  const guideName = trip === null ? null : guideSticker(trip.guide).name;
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="draft-loading">
      <View style={styles.header}>
        <BackEyebrow
          label={draftBackLabel(trip?.destination ?? null)}
          onPress={onBack}
          testID="draft-back"
        />
      </View>
      <View style={styles.content}>
        <Skeleton
          preset="card"
          repeat={3}
          label={t({ id: 'planDraft.loading.label', message: 'Loading your draft' })}
          {...(trip === null || guideName === null
            ? {}
            : {
                slowHint: (
                  <GuideLine
                    guide={trip.guide}
                    name={guideName}
                    testID="draft-loading-slow"
                    line={t({
                      id: 'planDraft.loading.slow',
                      message: `${guideName} is laying out your days…`,
                    })}
                  />
                ),
              })}
        />
      </View>
    </Scaffold>
  );
}
