/**
 * A draft sheet before its draft is on the phone: the sheet itself with a skeleton, so the route
 * never sits blank over the screen underneath taking its touches. When the draft turns out to be
 * gone it closes onto the draft screen, which says what there is instead.
 */
import { useEffect } from 'react';
import { View } from 'react-native';

import { goBackOr } from '@/lib/navigation/back';
import { Sheet } from '@/ui/sheet/Sheet';
import { Skeleton } from '@/ui/states/Skeleton';
import { makeStyles } from '@/ui/theme';

import { draftLoadingLabel } from '../review/draft-copy';
import { draftRoutes } from '../routes';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, paddingBottom: th.space['24'] },
}));

export function DraftSheetWaiting({
  tripId,
  gone,
}: {
  readonly tripId: string;
  /** Read, and there is no draft to act on. */
  readonly gone: boolean;
}) {
  const styles = useStyles();
  useEffect(() => {
    if (gone) goBackOr(draftRoutes.review(tripId));
  }, [gone, tripId]);
  return (
    <Sheet accessibilityLabel={draftLoadingLabel()} testID="draft-sheet-waiting">
      <View style={styles.body}>
        <Skeleton preset="list" repeat={3} label={draftLoadingLabel()} />
      </View>
    </Sheet>
  );
}
