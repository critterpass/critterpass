/**
 * SHOW IT (designed in code): the phrase full screen on paper, as large as it fits, any
 * orientation, with the screen at full brightness until it closes (the brightness module is in
 * the installed build; without it the screen stays as it is).
 */
import { useLingui } from '@lingui/react/macro';
import { requireOptionalNativeModule } from 'expo';
import type * as BrightnessModule from 'expo-brightness';
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

function brightness(): typeof BrightnessModule | null {
  if (requireOptionalNativeModule('ExpoBrightness') === null) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded native-module load
  return require('expo-brightness') as typeof BrightnessModule;
}

export interface ShowItProps {
  readonly phrase: string;
  readonly lang: string;
  readonly gloss: string;
  readonly onClose: () => void;
}

export function ShowIt({ phrase, lang, gloss, onClose }: ShowItProps) {
  const { t } = useLingui();
  const theme = useTheme();
  useEffect(() => {
    const module = brightness();
    if (module === null) return undefined;
    let before: number | null = null;
    void module
      .getBrightnessAsync()
      .then((level) => {
        before = level;
        return module.setBrightnessAsync(1);
      })
      .catch(() => undefined);
    return () => {
      if (before !== null) void module.setBrightnessAsync(before).catch(() => undefined);
    };
  }, []);
  return (
    <Modal
      visible
      animationType="fade"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={onClose}
    >
      <Pressable
        style={[
          styles.fill,
          { backgroundColor: theme.color.paper.base, padding: theme.size.gutter },
        ]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t({ id: 'safety.showIt.close', message: 'Close the phrase' })}
        testID="help-show-it-screen"
      >
        <View style={styles.center}>
          <Text
            variant="displayHero"
            color={theme.color.paper.ink}
            accessibilityLanguage={lang}
            style={styles.phrase}
          >
            {phrase}
          </Text>
          <Text variant="body" color={theme.color.paper.muted}>
            {gloss}
          </Text>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  phrase: { textAlign: 'center' },
});
