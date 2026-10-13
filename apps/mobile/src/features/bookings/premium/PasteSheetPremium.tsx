/**
 * Paste a booking (7.03's Paste tile; the sheet is undesigned, logged in docs/undesigned-states.md):
 * a native form sheet with Cancel and "Read it", the line saying what it takes, the system paste
 * control on iOS (the pasteboard is read only when the member taps it, so no paste alert) or a
 * paste button on Android, and the field. What is read lands on the add page behind it as a find.
 */
import { useLingui } from '@lingui/react/macro';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Button, Text, TextField, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import { usePasteImport } from '../add/use-paste-import';
import { useWalletContext } from '../data/use-wallet-context';
import { useWalletGuide, WalletGuideProvider } from '../data/wallet-guide';
import { pasteBody } from '../paste/paste-kind';

/** The system paste control's size: it draws its own label, so it needs room for it. */
const PASTE_CONTROL = { width: 200, height: 44 } as const;

function PasteBodyFields(props: {
  readonly value: string;
  readonly empty: boolean;
  readonly error: 'offline' | 'failed' | null;
  readonly onTake: (text: string) => void;
  readonly readClipboard: () => Promise<string>;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { name: guideName } = useWalletGuide();
  const systemPaste = Platform.OS === 'ios' && Clipboard.isPasteButtonAvailable;
  return (
    <View style={{ gap: th.space.gap12, paddingTop: th.space.gap8 }}>
      <Text variant="note" tone="inkSecondary">
        {t({
          id: 'bookings.paste.line',
          message: 'A confirmation code, a link from the booking site, or the whole email.',
        })}
      </Text>
      {systemPaste ? (
        <Clipboard.ClipboardPasteButton
          acceptedContentTypes={['url', 'plain-text']}
          displayMode="iconAndLabel"
          cornerStyle="capsule"
          backgroundColor={th.color.ink}
          foregroundColor={th.color.onInk}
          style={[styles.paste, PASTE_CONTROL]}
          onPress={(data) => {
            if (data.type === 'text') props.onTake(data.text);
          }}
        />
      ) : (
        <Button
          label={t({ id: 'bookings.paste.fromClipboard', message: 'Paste from clipboard' })}
          variant="control"
          size="medium"
          onPress={() => void props.readClipboard().then(props.onTake)}
          testID="bookings-paste-clipboard"
        />
      )}
      <TextField
        accessibilityLabel={t({ id: 'bookings.paste.field', message: 'Link or code' })}
        placeholder={t({ id: 'bookings.paste.field', message: 'Link or code' })}
        value={props.value}
        onChangeText={props.onTake}
        multiline
        submitBehavior="blurAndSubmit"
        returnKeyType="done"
        autoCapitalize="none"
        autoCorrect={false}
        error={
          props.empty
            ? t({
                id: 'bookings.paste.empty',
                message: 'Nothing to paste yet. Copy the link or code first.',
              })
            : props.error === 'offline'
              ? t({
                  id: 'bookings.paste.offline',
                  message: `${guideName} needs signal to read it.`,
                })
              : props.error === 'failed'
                ? t({ id: 'bookings.paste.failed', message: "That didn't go through. Try again." })
                : undefined
        }
        testID="bookings-paste-field"
      />
    </View>
  );
}

function PasteSheet() {
  const { t } = useLingui();
  const context = useWalletContext();
  // The sheet's verb closes it once the paste went through.
  const paste = usePasteImport(context.trip?.id ?? null, () => undefined);
  const [value, setValue] = useState('');
  const [empty, setEmpty] = useState(false);
  const take = (text: string) => {
    setEmpty(text.trim() === '');
    setValue(text);
  };
  const body = pasteBody(value);
  return (
    <SheetScreen
      title={t({ id: 'bookings.paste.title', message: 'Paste a booking' })}
      cancelLabel={t({ id: 'common.confirm.cancel', message: 'Cancel' })}
      verb={{
        label: t({ id: 'bookings.paste.read', message: 'Read it' }),
        disabled: body === null || paste.sending,
        // A failure keeps the sheet open and says why under the field.
        onPress: () => (body === null ? false : paste.send(body)),
        testID: 'bookings-paste-send',
      }}
      dirty={value.trim() !== ''}
      discardPrompt={{
        title: t({ id: 'bookings.premium.pasteDiscardTitle', message: 'Drop what you pasted?' }),
        message: t({
          id: 'bookings.premium.pasteDiscardLine',
          message: 'Nothing has been read yet.',
        }),
        discard: t({ id: 'money.premium.discard', message: 'Discard' }),
        keep: t({ id: 'bookings.premium.keepEditing', message: 'Keep editing' }),
      }}
      testID="bookings-paste"
    >
      <PasteBodyFields
        value={value}
        empty={empty}
        error={paste.error}
        onTake={take}
        readClipboard={paste.readClipboard}
      />
    </SheetScreen>
  );
}

/** The paste sheet route's screen. */
export function PasteSheetPremium() {
  const context = useWalletContext();
  return (
    <WalletGuideProvider tripId={context.trip?.id ?? null}>
      <PasteSheet />
    </WalletGuideProvider>
  );
}

const styles = StyleSheet.create({
  paste: { alignSelf: 'center' },
});
