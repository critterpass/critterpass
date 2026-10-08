/**
 * The banner over the album grid while this device has photos for the trip going up, waiting,
 * failed or skipped: the line ("Uploading 12 of 50 photos."), a bar while they go up, "try the
 * failed ones again", and a way to put a skipped notice away. It follows the upload queue by
 * itself, so the grid under it is not redrawn as bytes move; finished photos leave the queue as
 * soon as nothing else of the trip is in it.
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { TextLink } from '@/ui/buttons/TextLink';
import { Row } from '@/ui/layout/Row';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import { uploadBanner } from '../grid/album-copy';
import { albumUploadQueue } from './device-upload';
import { onlyDoneLeft, sameCounts, uploadCounts, type UploadCounts } from './upload-summary';

const useStyles = makeStyles((t) => ({
  banner: {
    borderRadius: t.radius.md,
    backgroundColor: t.semantic.bg.raised,
    padding: t.space['12'],
    gap: t.space['8'],
  },
  track: {
    height: t.space['6'],
    borderRadius: t.radius.pill,
    backgroundColor: t.semantic.bg.control,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  fill: {
    height: t.space['6'],
    borderRadius: t.radius.pill,
    backgroundColor: t.semantic.action.primary,
  },
}));

export interface UploadBannerViewProps {
  readonly counts: UploadCounts;
  readonly onRetry: () => void;
  readonly onDismiss: () => void;
}

export function UploadBannerView({ counts, onRetry, onDismiss }: UploadBannerViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const banner = uploadBanner(counts);
  if (banner === null) return null;
  const active = counts.uploading > 0;
  const settledOnly = !active && counts.waiting === 0 && counts.failed === 0;
  return (
    <View style={styles.banner} testID="album-upload-banner">
      <Text variant="body" singleLine={false}>
        {banner.line}
      </Text>
      {active && counts.total > 1 ? (
        <View
          style={styles.track}
          accessible
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: counts.total, now: counts.total - counts.uploading }}
          testID="album-upload-bar"
        >
          <View style={[styles.fill, { flex: counts.fraction }]} />
          <View style={{ flex: 1 - counts.fraction }} />
        </View>
      ) : null}
      {!active && counts.failed > 0 ? (
        <TextLink
          label={t({ id: 'album.upload.retry', message: 'Try the failed ones again' })}
          onPress={onRetry}
          testID="album-upload-retry"
        />
      ) : null}
      {settledOnly ? (
        <Row>
          <TextLink
            label={t({ id: 'album.upload.dismiss', message: 'OK' })}
            onPress={onDismiss}
            testID="album-upload-dismiss"
          />
        </Row>
      ) : null}
    </View>
  );
}

export function UploadBanner({
  tripId,
  onRetry,
}: {
  readonly tripId: string;
  readonly onRetry: () => void;
}) {
  const { commands } = useLocalFirst();
  const queue = albumUploadQueue(commands);
  const last = useRef<UploadCounts | null>(null);
  const counts = useSyncExternalStore(queue.subscribe, () => {
    const next = uploadCounts(queue.items(), tripId);
    if (last.current !== null && sameCounts(last.current, next)) return last.current;
    last.current = next;
    return next;
  });
  const settled = onlyDoneLeft(counts);
  useEffect(() => {
    if (settled) queue.clearSettled(tripId);
  }, [settled, queue, tripId]);
  return (
    <UploadBannerView
      counts={counts}
      onRetry={onRetry}
      onDismiss={() => queue.clearSettled(tripId)}
    />
  );
}
