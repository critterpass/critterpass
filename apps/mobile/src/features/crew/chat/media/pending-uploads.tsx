/**
 * This device's photo and voice messages still uploading, at the foot of the timeline: a progress
 * ring while the files go up ("Waiting for signal" offline), and Retry / Delete if an upload was
 * refused.
 */
import { plural, t } from '@lingui/core/macro';

import { InlineAction } from '@/ui/buttons/InlineAction';
import { ProgressRing } from '@/ui/data/ProgressRing';
import { Row, Stack, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

import type { UploadItem } from './use-upload-queue';

const useStyles = makeStyles((th) => ({
  item: {
    alignSelf: 'flex-end',
    alignItems: 'center',
    gap: th.space['10'],
    padding: th.space['10'],
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
  },
}));

export function uploadTitle(item: UploadItem): string {
  const voice = item.files.some((file) => file.kind === 'voice');
  if (voice) return t({ id: 'chat.upload.voice', message: 'Voice note' });
  return t({
    id: 'chat.upload.photos',
    message: plural(item.files.length, { one: 'Photo', other: '# photos' }),
  });
}

export function PendingUploads({
  items,
  online,
  onRetry,
  onDiscard,
}: {
  readonly items: readonly UploadItem[];
  readonly online: boolean;
  readonly onRetry: (id: string) => void;
  readonly onDiscard: (id: string) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack gap="6">
      {items.map((item) => (
        <Row key={item.id} style={styles.item} testID={`chat-upload-${item.id}`}>
          <ProgressRing
            progress={item.progress}
            size={28}
            accessibilityLabel={t({
              id: 'chat.upload.progress',
              message: `${Math.round(item.progress * 100)}% uploaded`,
            })}
          />
          <Stack gap="2">
            <Text variant="label">{uploadTitle(item)}</Text>
            <Text
              variant="caption"
              color={
                item.state === 'failed'
                  ? theme.semantic.state.urgent
                  : theme.semantic.text.secondary
              }
            >
              {item.state === 'failed'
                ? t({ id: 'chat.upload.failed', message: 'Didn’t upload' })
                : online
                  ? t({ id: 'chat.upload.uploading', message: 'Uploading' })
                  : t({ id: 'chat.upload.waiting', message: 'Waiting for signal' })}
            </Text>
          </Stack>
          {item.state === 'failed' ? (
            <>
              <InlineAction
                label={t({ id: 'chat.status.retry', message: 'Retry' })}
                onPress={() => onRetry(item.id)}
              />
              <InlineAction
                label={t({ id: 'chat.status.delete', message: 'Delete' })}
                onPress={() => onDiscard(item.id)}
              />
            </>
          ) : null}
        </Row>
      ))}
    </Stack>
  );
}
