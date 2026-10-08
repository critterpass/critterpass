/**
 * A destination's offline pack: the offer to download it ("search works offline once it's on this
 * phone"), the download's progress, and once it is here its size with a way to remove it (asked
 * first: the region is a large download).
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { LinearBar } from '@/ui/data/LinearBar';
import { Sheet } from '@/ui/sheet/Sheet';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { useOfflinePack, type OfflinePackStatus } from '../data/use-offline-pack';

export interface RegionPackCardViewProps {
  readonly destinationName: string;
  readonly status: OfflinePackStatus;
  /** 0–1 while downloading. */
  readonly progress: number;
  readonly bytes: number | null;
  readonly onDownload: () => void;
  readonly onRemove: () => void;
}

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.space['16'],
    gap: t.space['10'],
  },
}));

const MEGABYTE = 1_000_000;

export function RegionPackCardView(props: RegionPackCardViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const { destinationName: place, status } = props;
  if (status === 'checking') return null;
  const size =
    props.bytes === null
      ? null
      : format.number(i18n.locale, Math.max(1, Math.round(props.bytes / MEGABYTE)));
  return (
    <View style={styles.card} testID={`explore-pack-${status}`}>
      {status === 'downloaded' ? (
        <>
          <Text variant="rowTitle">
            {size === null
              ? t({ id: 'explore.pack.ready', message: `${place} works offline` })
              : t({ id: 'explore.pack.readySize', message: `${place} works offline · ${size} MB` })}
          </Text>
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {t({
              id: 'explore.pack.readyBody',
              message: 'The map and search are on this phone.',
            })}
          </Text>
          <TextLink
            label={t({ id: 'explore.pack.remove', message: 'Remove from this phone' })}
            onPress={props.onRemove}
            testID="explore-pack-remove"
          />
        </>
      ) : status === 'downloading' ? (
        <LinearBar
          value={props.progress}
          max={1}
          label={t({ id: 'explore.pack.downloading', message: `Downloading ${place}` })}
          valueLabel={format.percent(i18n.locale, props.progress)}
          testID="explore-pack-progress"
        />
      ) : (
        <>
          <Text variant="bodySm">
            {status === 'failed'
              ? t({
                  id: 'explore.pack.failed',
                  message: "The download didn't finish. Check your connection and try again.",
                })
              : t({
                  id: 'explore.pack.offer',
                  message: `Search and the map work offline once ${place} is on this phone.`,
                })}
          </Text>
          <PillButton
            label={
              status === 'failed'
                ? t({ id: 'explore.pack.retry', message: 'Try again' })
                : t({ id: 'explore.pack.download', message: 'Download for offline' })
            }
            size="sm"
            block={false}
            variant="secondary"
            onPress={props.onDownload}
            testID="explore-pack-download"
          />
        </>
      )}
    </View>
  );
}

export function RegionPackCard(props: {
  readonly destinationId: string;
  readonly destinationSlug: string;
  readonly destinationName: string;
}) {
  const { t } = useLingui();
  const pack = useOfflinePack(props.destinationId, props.destinationSlug);
  const [removing, setRemoving] = useState(false);
  const place = props.destinationName;
  return (
    <>
      <RegionPackCardView
        destinationName={place}
        status={pack.status}
        progress={pack.progress}
        bytes={pack.bytes}
        onDownload={pack.download}
        onRemove={() => setRemoving(true)}
      />
      {removing ? (
        <Sheet
          detents={['fit']}
          onDismiss={() => setRemoving(false)}
          testID="explore-pack-remove-sheet"
        >
          <ConfirmSheet
            mode="button"
            title={t({
              id: 'explore.pack.removeTitle',
              message: `Remove ${place} from this phone?`,
            })}
            consequences={[
              t({
                id: 'explore.pack.removeLine',
                message: 'Its map and search will need a connection until you download it again.',
              }),
            ]}
            confirmLabel={t({ id: 'explore.pack.removeConfirm', message: 'Remove' })}
            onConfirm={() => {
              setRemoving(false);
              pack.remove();
            }}
            onCancel={() => setRemoving(false)}
            testID="explore-pack-remove-confirm"
          />
        </Sheet>
      ) : null}
    </>
  );
}
