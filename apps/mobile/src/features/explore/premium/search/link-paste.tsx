/**
 * Add from a link before there is a link, in the premium look (4.32's sheet opened from the
 * clipboard card with nothing to read yet; undesigned): "Paste what you saved", the field with the
 * system Paste control where it exists (a Paste pill elsewhere), why it can't read what is there,
 * "Add from it" once the text holds a link, a screenshot as the other way in, and what it works
 * with. The candidates a mention could be (Pick one) open over the found places as a sheet of up to
 * three, each with its photo where there is one and the photo credit the sources ask for.
 */
import { t } from '@lingui/core/macro';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { screenCredits } from '@/data/media/use-place-tile-photos';
import { OverlaySheet } from '@/features/plan';
import { Button, ListCard, Text, TextButton, TextField, usePremiumTheme } from '@/ui/premium';

import { typedLink } from '../../search/clipboard';
import type { LinkPasteProps } from '../../search/link-paste';
import type { PickOneSheetProps } from '../../search/pick-one-sheet';
import { placeIcon } from '../../search/place-icons';
import { PlaceResultRow } from '../components/place-result-row';

const CREDIT_SEPARATOR = ' · ';
const PASTE_WIDTH = 120;
const PASTE_HEIGHT = 44;

export function PremiumLinkPaste(props: LinkPasteProps) {
  const theme = usePremiumTheme();
  const [text, setText] = useState('');
  const [empty, setEmpty] = useState(false);
  const link = typedLink(text);
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
  const add = () => {
    if (link !== null) props.onAdd(link.url);
  };
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: theme.space.gap16, gap: theme.space.gap12 }}
      testID="search-link-paste"
    >
      <Text variant="title" accessibilityRole="header">
        {t({ id: 'search.paste.title', message: 'Paste what you saved' })}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap10 }}>
        <View style={{ flex: 1 }}>
          <TextField
            accessibilityLabel={placeholder}
            placeholder={placeholder}
            value={text}
            onChangeText={typed}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={add}
            testID="search-link-paste-field"
          />
        </View>
        {systemPaste ? (
          <Clipboard.ClipboardPasteButton
            acceptedContentTypes={['url', 'plain-text']}
            displayMode="iconAndLabel"
            style={{ width: PASTE_WIDTH, height: PASTE_HEIGHT }}
            onPress={(data) => {
              if (data.type === 'text') typed(data.text.trim());
            }}
          />
        ) : (
          <Button
            size="small"
            label={t({ id: 'search.paste.paste', message: 'Paste' })}
            onPress={paste}
            testID="search-link-paste-button"
          />
        )}
      </View>
      {wrong || empty || props.problem !== null ? (
        <Text variant="caption" tone="muted" testID="search-link-paste-note">
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
      <View style={{ gap: theme.space.gap6, alignItems: 'center' }}>
        <View style={{ alignSelf: 'stretch' }}>
          <Button
            label={t({ id: 'search.clipboard.add', message: 'Add from it' })}
            onPress={add}
            disabled={link === null}
            testID="search-link-paste-add"
          />
        </View>
        <TextButton
          label={t({ id: 'search.paste.screenshot', message: 'Or pick a screenshot' })}
          onPress={props.onScreenshot}
          testID="search-link-paste-screenshot"
        />
        <Text variant="captionMuted" tone="placeholder" align="center">
          {t({
            id: 'search.link.worksWith',
            message: 'Works with Instagram, Maps, YouTube and screenshots',
          })}
        </Text>
      </View>
    </ScrollView>
  );
}

export function PremiumPickOne({ label, candidates, photos, onPick, onClose }: PickOneSheetProps) {
  const credits = screenCredits(photos?.values() ?? []);
  return (
    <OverlaySheet
      title={t({ id: 'search.link.pickTitle', message: `Which is “${label}”?` })}
      closeLabel={t({ id: 'search.premium.pick.close', message: 'Close' })}
      onDismiss={onClose}
      testID="search-pick-one"
    >
      <ListCard>
        {candidates.map((candidate, index) => (
          <PlaceResultRow
            key={candidate.poi_id}
            title={candidate.name}
            meta={candidate.meta ?? undefined}
            icon={placeIcon(candidate.category)}
            photo={photos?.get(candidate.poi_id)?.tile.photo}
            onPress={() => onPick(candidate.poi_id)}
            testID={`search-pick-${String(index)}`}
          />
        ))}
      </ListCard>
      {credits.length === 0 ? null : (
        <Text variant="captionMuted" tone="placeholder" testID="photo-credit">
          {credits.join(CREDIT_SEPARATOR)}
        </Text>
      )}
    </OverlaySheet>
  );
}
