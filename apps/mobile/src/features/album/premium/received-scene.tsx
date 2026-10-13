/**
 * A postcard a crewmate sent you (undesigned; the composer's own parts, read-only): who it is
 * from, the postcard in the sender's format, and a way on to sending your own. ✕ closes.
 */
import { t } from '@lingui/core/macro';
import { Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, GlassIconButton, Text, usePremiumTheme } from '@/ui/premium';

import type { ReceivedViewProps } from '../postcard/postcard-look';
import { PostcardCards } from './postcard-cards';

export function PremiumReceivedScene(props: ReceivedViewProps) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const sender = props.sender;
  return (
    <View style={{ flex: 1, backgroundColor: th.color.ground }} testID="postcard-received">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 6,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 32,
          gap: 18,
        }}
      >
        <GlassIconButton
          icon="close"
          label={t({ id: 'album.postcard.close', message: 'Done' })}
          onPress={props.onClose}
          testID="postcard-received-close"
        />
        <View>
          <Text variant="label" tone="muted">
            {t({ id: 'album.received.from', message: `From ${sender}` })}
          </Text>
          <Text variant="largeTitle" accessibilityRole="header">
            {t({ id: 'album.received.title', message: 'A postcard for you' })}
          </Text>
        </View>
        <PostcardCards
          format={props.format}
          photoKey={props.photoKey}
          photoCaption={null}
          place={props.place}
          note={props.note}
          signature={sender.slice(0, 1).toUpperCase()}
          guide={props.guide}
        />
        <Button
          label={t({ id: 'album.received.own', message: 'Send your own' })}
          onPress={props.onOwn}
          variant="secondary"
          testID="postcard-received-own"
        />
      </ScrollView>
    </View>
  );
}
