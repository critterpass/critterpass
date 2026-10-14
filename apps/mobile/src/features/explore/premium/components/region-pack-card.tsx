/**
 * A destination's offline pack in the premium look (undesigned in the premium set; built from the
 * kit's card, progress bar and buttons): the offer to download it ("search works offline once it's
 * on this phone"), the download's progress, and once it is here its size with a way to remove it
 * (asked first with the system alert: the region is a large download).
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Button, Card, ProgressBar, Text, TextButton } from '@/ui/premium';
import { confirmAlert } from '@/ui/premium/shell';

import { useOfflinePack, type OfflinePackStatus } from '../../data/use-offline-pack';

export interface RegionPackCardViewProps {
  readonly destinationName: string;
  readonly status: OfflinePackStatus;
  /** 0–1 while downloading. */
  readonly progress: number;
  readonly bytes: number | null;
  readonly onDownload: () => void;
  readonly onRemove: () => void;
}

const MEGABYTE = 1_000_000;

export function RegionPackCardView(props: RegionPackCardViewProps) {
  const { t, i18n } = useLingui();
  const { destinationName: place, status } = props;
  if (status === 'checking') return null;
  const size =
    props.bytes === null
      ? null
      : format.number(i18n.locale, Math.max(1, Math.round(props.bytes / MEGABYTE)));
  return (
    <Card testID={`explore-pack-${status}`}>
      <View style={{ gap: 10 }}>
        {status === 'downloaded' ? (
          <>
            <Text variant="rowTitle">
              {size === null
                ? t({ id: 'explore.pack.ready', message: `${place} works offline` })
                : t({
                    id: 'explore.pack.readySize',
                    message: `${place} works offline · ${size} MB`,
                  })}
            </Text>
            <Text variant="rowText" tone="muted">
              {t({
                id: 'explore.pack.readyBody',
                message: 'The map and search are on this phone.',
              })}
            </Text>
            <TextButton
              label={t({ id: 'explore.pack.remove', message: 'Remove from this phone' })}
              onPress={props.onRemove}
              testID="explore-pack-remove"
            />
          </>
        ) : status === 'downloading' ? (
          <ProgressBar
            label={t({ id: 'explore.pack.downloading', message: `Downloading ${place}` })}
            value={props.progress}
            valueLabel={format.percent(i18n.locale, props.progress)}
            testID="explore-pack-progress"
          />
        ) : (
          <>
            <Text variant="rowText">
              {status === 'failed'
                ? t({
                    id: 'explore.pack.failed',
                    message: 'The download didn’t finish. Check your connection and try again.',
                  })
                : t({
                    id: 'explore.pack.offer',
                    message: `Search and the map work offline once ${place} is on this phone.`,
                  })}
            </Text>
            <View style={{ alignSelf: 'flex-start' }}>
              <Button
                label={
                  status === 'failed'
                    ? t({ id: 'explore.pack.retry', message: 'Try again' })
                    : t({ id: 'explore.pack.download', message: 'Download for offline' })
                }
                size="small"
                variant="secondary"
                onPress={props.onDownload}
                testID="explore-pack-download"
              />
            </View>
          </>
        )}
      </View>
    </Card>
  );
}

export function RegionPackCard(props: {
  readonly destinationId: string;
  readonly destinationSlug: string;
  readonly destinationName: string;
}) {
  const { t } = useLingui();
  const pack = useOfflinePack(props.destinationId, props.destinationSlug);
  const place = props.destinationName;
  const askToRemove = async () => {
    const yes = await confirmAlert({
      title: t({ id: 'explore.pack.removeTitle', message: `Remove ${place} from this phone?` }),
      message: t({
        id: 'explore.pack.removeLine',
        message: 'Its map and search will need a connection until you download it again.',
      }),
      confirm: t({ id: 'explore.pack.removeConfirm', message: 'Remove' }),
      cancel: t({ id: 'common.confirm.cancel', message: 'Cancel' }),
    });
    if (yes) pack.remove();
  };
  return (
    <RegionPackCardView
      destinationName={place}
      status={pack.status}
      progress={pack.progress}
      bytes={pack.bytes}
      onDownload={pack.download}
      onRemove={() => void askToRemove()}
    />
  );
}
