/** Full view of one chat photo (the original), over everything, closed with ✕ or back. */
import { t } from '@lingui/core/macro';
import { Image, Modal, StyleSheet, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloseButton } from '@/ui/sheet/CloseButton';
import { useTheme } from '@/ui';

import { useChatMedia } from './media-services';
import { useReadUrl } from './read-urls';

export function MediaViewer({
  mediaKey,
  onClose,
}: {
  readonly mediaKey: string;
  readonly onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const media = useChatMedia();
  const url = useReadUrl(media?.http ?? null, mediaKey);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.semantic.bg.base }]}
        testID="chat-media-viewer"
      >
        {url === null ? null : (
          <Image
            source={{ uri: url }}
            resizeMode="contain"
            style={StyleSheet.absoluteFill}
            accessibilityLabel={t({ id: 'chat.photo.full', message: 'Photo' })}
          />
        )}
        <CloseButton
          onPress={onClose}
          style={{
            position: 'absolute',
            top: insets.top + theme.space['8'],
            right: theme.space['16'],
          }}
          testID="chat-media-viewer-close"
        />
      </View>
    </Modal>
  );
}
