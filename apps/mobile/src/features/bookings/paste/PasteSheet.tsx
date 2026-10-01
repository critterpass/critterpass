/**
 * PASTE (3h-2; the sheet is undesigned): a field for a confirmation code, link or the email's
 * text, with the system paste control on iOS (UIPasteControl: the pasteboard is read only when
 * the member taps it, so no paste alert) and a PASTE FROM CLIPBOARD button on Android, then READ IT.
 */
import { useLingui } from '@lingui/react/macro';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextField } from '@/ui/inputs/TextField';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import { pasteBody, type PasteBody } from './paste-kind';
import { useWalletGuide } from '../data/wallet-guide';

const PASTE_WIDTH = 200;

const useStyles = makeStyles((t) => ({
  body: { padding: t.space['16'], gap: t.space['12'] },
  paste: { width: PASTE_WIDTH, height: MIN_TOUCH_TARGET, alignSelf: 'center' },
}));

export interface PasteSheetProps {
  readonly sending: boolean;
  readonly error: 'offline' | 'failed' | null;
  readonly readClipboard: () => Promise<string>;
  readonly onSend: (body: PasteBody) => void;
  readonly onClose: () => void;
  /** Text the field opens with (a confirmation handed to the sheet). */
  readonly initialText?: string;
}

export function PasteSheet(props: PasteSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const { name: guideName } = useWalletGuide();
  const [value, setValue] = useState(props.initialText ?? '');
  const [empty, setEmpty] = useState(false);
  const title = t({ id: 'bookings.paste.title', message: 'Paste a booking' });
  const take = (text: string) => {
    setEmpty(text.trim() === '');
    setValue(text);
  };
  const systemPaste = Platform.OS === 'ios' && Clipboard.isPasteButtonAvailable;
  const body = pasteBody(value);
  return (
    <Sheet
      detents={['fit']}
      title={title}
      onDismiss={props.onClose}
      accessibilityLabel={title}
      testID="bookings-paste"
    >
      <View style={styles.body}>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'bookings.paste.line',
            message: 'A confirmation code, a link from the booking site, or the whole email.',
          })}
        </Text>
        {systemPaste ? (
          <Clipboard.ClipboardPasteButton
            acceptedContentTypes={['url', 'plain-text']}
            displayMode="iconAndLabel"
            style={styles.paste}
            onPress={(data) => {
              if (data.type === 'text') take(data.text);
            }}
          />
        ) : (
          <PillButton
            label={t({ id: 'bookings.paste.fromClipboard', message: 'Paste from clipboard' })}
            onPress={() => void props.readClipboard().then(take)}
            variant="secondary"
            testID="bookings-paste-clipboard"
          />
        )}
        <TextField
          label={t({ id: 'bookings.paste.field', message: 'Link or code' })}
          value={value}
          onChangeText={take}
          multiline
          // A whole pasted email scrolls inside the field, so READ IT stays above the keyboard.
          maxLines={5}
          // Return puts the keyboard away (a pasted confirmation needs no new lines typed), which
          // brings READ IT back on a phone too short to show both.
          submitBehavior="blurAndSubmit"
          returnKeyType="done"
          autoCapitalize="none"
          autoCorrect={false}
          {...(empty
            ? {
                status: 'error' as const,
                message: t({
                  id: 'bookings.paste.empty',
                  message: 'Nothing to paste yet. Copy the link or code first.',
                }),
              }
            : {})}
          testID="bookings-paste-field"
        />
        {props.error === null ? null : (
          <Text variant="bodySm" color={theme.semantic.state.urgent} testID="bookings-paste-error">
            {props.error === 'offline'
              ? t({
                  id: 'bookings.paste.offline',
                  message: `${guideName} needs signal to read it.`,
                })
              : t({ id: 'bookings.paste.failed', message: "That didn't go through. Try again." })}
          </Text>
        )}
        <Stack>
          <PillButton
            label={t({ id: 'bookings.paste.read', message: 'Read it' })}
            onPress={() => {
              if (body !== null) props.onSend(body);
            }}
            disabled={body === null}
            loading={props.sending}
            testID="bookings-paste-send"
          />
        </Stack>
      </View>
    </Sheet>
  );
}
