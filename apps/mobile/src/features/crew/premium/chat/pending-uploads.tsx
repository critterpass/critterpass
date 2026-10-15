/**
 * This phone's photo and voice messages that have not gone out yet, at the foot of the timeline,
 * on the sender's side: the photos it took (from the phone itself, dimmed) or a voice pill, under
 * them a line ("Waiting for signal", "Sending…" with the share uploaded, or "Didn't send") and,
 * once an upload was refused, Retry and Delete. Undesigned in the premium set: built from the
 * chat's own photo tile and voice pill.
 */
import { plural, t } from '@lingui/core/macro';
import { Image, View, useWindowDimensions } from 'react-native';

import { Icon, Spinner, Text, TextButton, makePremiumStyles, usePremiumTheme } from '@/ui/premium';

import type { UploadItem } from '../../chat/media/use-upload-queue';
import { MAX_TILES, clampRatio } from './cards/media-cards';

const PHOTO_SHARE = 0.66;
const GAP = 4;

const useStyles = makePremiumStyles((th) => ({
  item: { alignSelf: 'flex-end', alignItems: 'flex-end', gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, justifyContent: 'flex-end' },
  tile: { borderRadius: 18, overflow: 'hidden', backgroundColor: th.color.control },
  more: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.color.scrim,
  },
  voice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: th.color.inkSurface,
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: th.space.gap6 },
  actions: { flexDirection: 'row', gap: th.space.gap12 },
}));

export function uploadStatus(item: UploadItem, online: boolean): string {
  if (item.state === 'failed')
    return t({ id: 'chat.premium.upload.failed', message: 'Didn’t send' });
  if (!online) return t({ id: 'chat.premium.upload.waiting', message: 'Waiting for signal' });
  const percent = Math.round(item.progress * 100);
  return t({ id: 'chat.premium.upload.sending', message: `Sending… ${percent}%` });
}

function Photos({ item }: { readonly item: UploadItem }) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const width = Math.round(useWindowDimensions().width * PHOTO_SHARE);
  const photos = item.files.filter((file) => file.kind === 'photo');
  const single = photos.length === 1;
  const tile = single ? width : Math.floor((width - GAP) / 2);
  const shown = photos.slice(0, MAX_TILES);
  const extra = photos.length - shown.length;
  return (
    <View style={[styles.grid, { width }]}>
      {shown.map((photo, index) => {
        const ratio = single && photo.w && photo.h ? clampRatio(photo.w / photo.h) : 1;
        return (
          <View key={photo.uri} style={[styles.tile, { width: tile, aspectRatio: ratio }]}>
            <Image
              source={{ uri: photo.uri }}
              style={{ flex: 1, opacity: 0.6 }}
              resizeMode="cover"
            />
            {extra > 0 && index === shown.length - 1 ? (
              <View style={styles.more}>
                <Text variant="title" color={th.color.onInkSurface}>{`+${extra}`}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
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
  const th = usePremiumTheme();
  const styles = useStyles();
  if (items.length === 0) return null;
  return (
    <View style={{ gap: th.space.gap12, paddingVertical: th.space.gap4 }}>
      {items.map((item) => {
        const voice = item.files.some((file) => file.kind === 'voice');
        const failed = item.state === 'failed';
        const status = uploadStatus(item, online);
        const what = voice
          ? t({ id: 'chat.premium.upload.voice', message: 'Voice note' })
          : t({
              id: 'chat.premium.upload.photos',
              message: plural(item.files.length, { one: 'Photo', other: '# photos' }),
            });
        return (
          <View
            key={item.id}
            style={styles.item}
            accessible={!failed}
            accessibilityLabel={`${what}. ${status}`}
            testID={`chat-upload-${item.id}`}
          >
            {voice ? (
              <View style={[styles.voice, { opacity: 0.6 }]}>
                <Icon name="mic" size={18} color={th.color.onInkSurface} />
                <Text variant="rowTextStrong" color={th.color.onInkSurface}>
                  {what}
                </Text>
              </View>
            ) : (
              <Photos item={item} />
            )}
            {item.body === '' ? null : <Text variant="body">{item.body}</Text>}
            <View style={styles.status}>
              {failed ? (
                <Icon name="retry" size={14} color={th.color.destructive.listAction} />
              ) : online ? (
                <Spinner size={14} />
              ) : null}
              <Text
                variant="captionMuted"
                {...(failed
                  ? { color: th.color.destructive.listAction }
                  : { tone: 'muted' as const })}
              >
                {status}
              </Text>
            </View>
            {failed ? (
              <View style={styles.actions}>
                <TextButton
                  label={t({ id: 'chat.premium.upload.retry', message: 'Retry' })}
                  onPress={() => onRetry(item.id)}
                  testID={`chat-upload-retry-${item.id}`}
                />
                <TextButton
                  label={t({ id: 'chat.premium.upload.delete', message: 'Delete' })}
                  onPress={() => onDiscard(item.id)}
                  testID={`chat-upload-delete-${item.id}`}
                />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
