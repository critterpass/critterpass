/**
 * Add from a link opened with no link yet (7d-3, undesigned): the "paste what you saved" tile
 * lands here. A field to paste into, PASTE where the clipboard can be read on a tap, ADD FROM IT
 * once the text holds a link, and a screenshot as the other way in.
 */
import { t } from '@lingui/core/macro';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { makeStyles, MIN_TOUCH_TARGET, Text, useTheme } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Sheet } from '@/ui/sheet/Sheet';

import { typedLink } from './clipboard';

const PASTE_WIDTH = 120;

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, paddingBottom: th.space['24'], gap: th.space['14'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: th.space['10'] },
  field: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: th.space['14'],
    borderRadius: th.radius.md,
    backgroundColor: th.semantic.bg.raised,
    color: th.semantic.text.primary,
  },
  paste: { width: PASTE_WIDTH, height: MIN_TOUCH_TARGET },
  actions: { gap: th.space['10'], alignItems: 'center' },
}));

export interface LinkPasteProps {
  /** Why the last try did not work (an unreadable screenshot), or null. */
  readonly problem: string | null;
  /** The clipboard's text where it can be read on a tap (Android); null elsewhere. */
  readonly readClipboard: () => Promise<string | null>;
  readonly onAdd: (url: string) => void;
  readonly onScreenshot: () => void;
  readonly onClose: () => void;
  /** Lab and tests: leave the system paste control out. */
  readonly pasteControl?: boolean;
}

export function LinkPaste(props: LinkPasteProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [text, setText] = useState('');
  const [empty, setEmpty] = useState(false);
  const link = typedLink(text);
  const title = t({ id: 'search.paste.title', message: 'Paste what you saved' });
  const typed = (value: string) => {
    setText(value);
    setEmpty(false);
  };
  const paste = () => {
    void props.readClipboard().then((copied) => {
      if (copied === null || copied.trim() === '') setEmpty(true);
      else typed(copied.trim());
    });
  };
  const placeholder = t({ id: 'search.paste.placeholder', message: 'A TikTok, post or map link' });
  const systemPaste = props.pasteControl !== false && Clipboard.isPasteButtonAvailable;
  const wrong = text.trim() !== '' && link === null;
  return (
    <Sheet
      header={<Text variant="eyebrow">{title}</Text>}
      onDismiss={props.onClose}
      accessibilityLabel={title}
      testID="search-link-paste"
    >
      <View style={styles.body}>
        <View style={styles.row}>
          <TextInput
            value={text}
            onChangeText={typed}
            placeholder={placeholder}
            placeholderTextColor={theme.semantic.text.secondary}
            accessibilityLabel={placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={() => {
              if (link !== null) props.onAdd(link.url);
            }}
            style={styles.field}
            testID="search-link-paste-field"
          />
          {systemPaste ? (
            <Clipboard.ClipboardPasteButton
              acceptedContentTypes={['url', 'plain-text']}
              displayMode="iconAndLabel"
              style={styles.paste}
              onPress={(data) => {
                if (data.type === 'text') typed(data.text.trim());
              }}
            />
          ) : (
            <PillButton
              label={t({ id: 'search.paste.paste', message: 'Paste' })}
              size="sm"
              tone="ink"
              onPress={paste}
              testID="search-link-paste-button"
            />
          )}
        </View>
        {wrong || empty || props.problem !== null ? (
          <Text
            variant="bodySm"
            color={theme.semantic.text.secondary}
            testID="search-link-paste-note"
          >
            {wrong
              ? t({
                  id: 'search.paste.notLink',
                  message: 'That isn’t a link yet. Copy the post’s link and paste it here.',
                })
              : empty
                ? t({
                    id: 'search.paste.nothingCopied',
                    message: 'Nothing copied yet. Copy a link first, or type it in.',
                  })
                : props.problem}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <PillButton
            label={t({ id: 'search.clipboard.add', message: 'Add from it' })}
            onPress={() => {
              if (link !== null) props.onAdd(link.url);
            }}
            disabled={link === null}
            block
            testID="search-link-paste-add"
          />
          <TextLink
            label={t({ id: 'search.paste.screenshot', message: 'Or pick a screenshot' })}
            onPress={props.onScreenshot}
            testID="search-link-paste-screenshot"
          />
          <Text variant="caption" color={theme.semantic.text.secondary}>
            {t({
              id: 'search.link.worksWith',
              message: 'Works with Instagram, Maps, YouTube and screenshots',
            })}
          </Text>
        </View>
      </View>
    </Sheet>
  );
}
