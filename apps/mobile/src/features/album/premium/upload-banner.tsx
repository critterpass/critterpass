/**
 * The journal's upload banner (8.12, undesigned): while this phone's photos for the trip go up,
 * wait, fail or are skipped, the line ("Uploading 12 of 50 photos."), a thin bar while they go,
 * try the failed ones again, and OK to put a skipped notice away.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Text, TextButton, makePremiumStyles } from '@/ui/premium';

import { uploadBanner } from '../grid/album-copy';
import type { UploadBannerViewProps } from '../upload/upload-banner';

const useStyles = makePremiumStyles((th) => ({
  banner: {
    padding: 12,
    paddingHorizontal: 14,
    gap: 8,
    borderRadius: th.radius.banner,
    backgroundColor: th.color.banner.info.bg,
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: th.color.progressTodo,
  },
  fill: { height: 4, borderRadius: 2, backgroundColor: th.color.ink },
}));

export function PremiumUploadBanner({ counts, onRetry, onDismiss }: UploadBannerViewProps) {
  const styles = useStyles();
  const banner = uploadBanner(counts);
  if (banner === null) return null;
  const active = counts.uploading > 0;
  const settledOnly = !active && counts.waiting === 0 && counts.failed === 0;
  return (
    <View style={styles.banner} testID="album-upload-banner">
      <Text variant="rowText" tone="ink">
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
        <View style={{ alignSelf: 'flex-start' }}>
          <TextButton
            label={t({ id: 'album.upload.retry', message: 'Try the failed ones again' })}
            onPress={onRetry}
            testID="album-upload-retry"
          />
        </View>
      ) : null}
      {settledOnly ? (
        <View style={{ alignSelf: 'flex-start' }}>
          <TextButton
            label={t({ id: 'album.upload.dismiss', message: 'OK' })}
            onPress={onDismiss}
            testID="album-upload-dismiss"
          />
        </View>
      ) : null}
    </View>
  );
}
