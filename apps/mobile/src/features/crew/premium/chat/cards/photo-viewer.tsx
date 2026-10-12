/**
 * A chat photo full screen (5.11, undesigned): the message's photos side by side, swiped one to
 * the next, starting on the one tapped, with its caption under them and ✕ top-left on clear glass.
 * Each photo shows once its signed link arrives.
 */
import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import { FlatList, Image, Modal, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassIconButton, Spinner, Text, usePremiumTheme } from '@/ui/premium';

import { useChatMedia } from '../../../chat/media/media-services';
import { readUrl } from '../../../chat/media/read-urls';

export function PremiumPhotoViewer({
  keys,
  openKey,
  caption,
  onClose,
}: {
  readonly keys: readonly string[];
  readonly openKey: string;
  readonly caption: string;
  readonly onClose: () => void;
}) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const media = useChatMedia();
  const http = media?.http ?? null;
  const [urls, setUrls] = useState<Readonly<Record<string, string>>>({});
  const joined = keys.join('\n');
  useEffect(() => {
    if (http === null) return undefined;
    let live = true;
    for (const key of joined.split('\n')) {
      void readUrl(http, key).then((url) => {
        if (live && url !== null) setUrls((known) => ({ ...known, [key]: url }));
      });
    }
    return () => {
      live = false;
    };
  }, [http, joined]);
  const start = Math.max(0, keys.indexOf(openKey));
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: th.color.inkSurface }} testID="chat-media-viewer">
        <FlatList
          horizontal
          pagingEnabled
          data={keys}
          initialScrollIndex={start}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          keyExtractor={(key) => key}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => {
            const url = urls[item];
            return (
              <View style={{ width, flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                {url === undefined ? (
                  <Spinner />
                ) : (
                  <Image
                    source={{ uri: url }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="contain"
                  />
                )}
              </View>
            );
          }}
        />
        <View style={{ position: 'absolute', top: insets.top + 6, left: 20 }}>
          <GlassIconButton
            icon="close"
            kind="clear"
            label={t({ id: 'chat.premium.viewer.close', message: 'Close' })}
            onPress={onClose}
            testID="chat-media-viewer-close"
          />
        </View>
        {caption === '' ? null : (
          <View style={{ position: 'absolute', left: 20, right: 20, bottom: insets.bottom + 20 }}>
            <Text variant="body" color={th.color.onInkSurface}>
              {caption}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}
