import * as Clipboard from 'expo-clipboard';
import { useCallback } from 'react';

import { Button, type ButtonSize, type ButtonVariant } from './Button';

export interface PasteButtonProps {
  /** "Paste a link", "Paste". */
  readonly label: string;
  /** The pasted text; never called for an empty clipboard. */
  readonly onPaste: (text: string) => void;
  /** @default 'floating' */
  readonly variant?: ButtonVariant;
  /** @default 'small' */
  readonly size?: ButtonSize;
  readonly testID?: string;
}

/**
 * The premium paste control: a kit pill that reads the clipboard only when tapped (never before).
 * It replaces the system paste control (`ClipboardPasteButton`), whose colours React Native's view
 * layer takes for its own background: it drew a rectangle in the screen's colour around a
 * system-blue capsule. iOS may ask once whether the app can paste.
 */
export function PasteButton({
  label,
  onPaste,
  variant = 'floating',
  size = 'small',
  testID = 'paste-button',
}: PasteButtonProps) {
  const paste = useCallback(() => {
    void Clipboard.getStringAsync()
      .then((text) => {
        const trimmed = text.trim();
        if (trimmed !== '') onPaste(trimmed);
      })
      .catch(() => undefined);
  }, [onPaste]);
  return (
    <Button
      label={label}
      icon="paste"
      variant={variant}
      size={size}
      onPress={paste}
      testID={testID}
    />
  );
}
