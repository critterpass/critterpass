/**
 * Point and ask before the camera is allowed (undesigned; built from the kit): on the viewfinder's
 * dark ground, the camera glyph, what the camera is for in the guide's words, and "Allow camera",
 * whose tap is what raises the system ask. The screen stays put while it is up; once allowed the
 * preview fades in over this.
 */
import { t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, PHOTO_VIEWER_PAINT, Text, usePremiumTheme } from '@/ui/premium';

export function PremiumCameraAsk({
  guideName,
  allow,
  asking,
}: {
  readonly guideName: string;
  readonly allow: () => void;
  readonly asking: boolean;
}) {
  const th = usePremiumTheme();
  return (
    <View
      style={[styles.root, { paddingHorizontal: th.space.titleGutter, gap: th.space.gap12 }]}
      testID="guide-camera-ask"
    >
      <Icon name="camera" size={40} color={PHOTO_VIEWER_PAINT.onPhoto} />
      <Text variant="title" color={PHOTO_VIEWER_PAINT.onPhoto} align="center">
        {t({ id: 'guide.premium.camera.askTitle', message: 'Show me the menu' })}
      </Text>
      <Text
        variant="body"
        color={PHOTO_VIEWER_PAINT.onPhotoMuted}
        align="center"
        singleLine={false}
      >
        {t({
          id: 'guide.premium.camera.askLine',
          message: `${guideName} uses the camera to read a menu and put it in your words.`,
        })}
      </Text>
      <Button
        label={t({ id: 'guide.premium.camera.allow', message: 'Allow camera' })}
        size="medium"
        onPress={allow}
        loading={asking}
        testID="guide-camera-allow"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
