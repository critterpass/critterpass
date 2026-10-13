import { useLingui } from '@lingui/react/macro';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useState } from 'react';
import { Linking, Platform, View } from 'react-native';

import { markPasteHintShown, pasteHintShown } from '@/lib/permissions/paste-hint';

import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { Button, type ButtonSize, type ButtonVariant } from './Button';
import { readPaste, showsPasteHint } from './paste-read';
import { TextButton } from './TextButton';

export interface PasteButtonProps {
  /** "Paste a link", "Paste". */
  readonly label: string;
  /** The pasted text; never called for an empty clipboard. */
  readonly onPaste: (text: string) => void;
  /** The clipboard held no text (a screen that says so). */
  readonly onEmpty?: () => void;
  /** @default 'floating' */
  readonly variant?: ButtonVariant;
  /** @default 'small' */
  readonly size?: ButtonSize;
  readonly testID?: string;
}

const IOS = Platform.OS === 'ios';

/**
 * The premium paste control: a kit pill that reads the clipboard only when tapped (never before).
 * It replaces the system paste control (`ClipboardPasteButton`), whose colours React Native's view
 * layer takes for its own background: it drew a rectangle in the screen's colour around a
 * system-blue capsule. iOS asks "Allow Paste" on each tap until the person allows pasting in
 * Settings, so under the pill a note says where (with "Open Settings"): every time a paste was
 * refused, and once per install after a paste. It never blocks the paste.
 */
export function PasteButton({
  label,
  onPaste,
  onEmpty,
  variant = 'floating',
  size = 'small',
  testID = 'paste-button',
}: PasteButtonProps) {
  const { t } = useLingui();
  const th = usePremiumTheme();
  const [hint, setHint] = useState(false);
  const paste = useCallback(() => {
    void readPaste(Clipboard, IOS).then((read) => {
      if (showsPasteHint(read, IOS, pasteHintShown())) {
        markPasteHintShown();
        setHint(true);
      }
      if (read.kind === 'text') onPaste(read.text);
      if (read.kind === 'empty') onEmpty?.();
    });
  }, [onPaste, onEmpty]);
  const button = (
    <Button
      label={label}
      icon="paste"
      variant={variant}
      size={size}
      onPress={paste}
      testID={testID}
    />
  );
  if (!hint) return button;
  return (
    <View style={{ alignItems: 'center', gap: th.space.gap6 }}>
      {button}
      <Text
        variant="caption"
        tone="muted"
        align="center"
        singleLine={false}
        accessibilityLiveRegion="polite"
        testID={`${testID}-hint`}
      >
        {t({
          id: 'common.premium.paste.allowHint',
          message:
            'To paste without this question each time, allow it in Settings → Paste from Other Apps.',
        })}
      </Text>
      <TextButton
        label={t({ id: 'common.premium.paste.openSettings', message: 'Open Settings' })}
        onPress={() => void Linking.openSettings()}
        testID={`${testID}-settings`}
      />
    </View>
  );
}
