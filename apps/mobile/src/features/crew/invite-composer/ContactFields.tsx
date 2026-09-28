/**
 * The composer's "a friend" fields: their first name, their number (optional: it only ever leaves
 * the device as a hash, and sets the home airport hint), a note up to 140 characters and up to
 * three taste tags the inviter confirms for them. Nothing is read from the address book.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { TASTE_TAGS, type TasteTag } from '@cp/domain';
import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { TextField } from '@/ui/inputs/TextField';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { tagWords } from '../../onboarding';

export const NOTE_MAX = 140;
export const TAGS_MAX = 3;

export interface ContactDraft {
  readonly name: string;
  readonly phone: string;
  readonly note: string;
  readonly tags: readonly TasteTag[];
}

export const EMPTY_CONTACT: ContactDraft = { name: '', phone: '', note: '', tags: [] };

const useStyles = makeStyles((th) => ({
  root: { gap: th.space['12'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['8'] },
}));

export function ContactFields({
  value,
  homeHint,
  onChange,
}: {
  readonly value: ContactDraft;
  readonly homeHint: string | null;
  readonly onChange: (next: ContactDraft) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const toggle = (tag: TasteTag) => {
    const has = value.tags.includes(tag);
    if (!has && value.tags.length >= TAGS_MAX) return;
    onChange({ ...value, tags: has ? value.tags.filter((x) => x !== tag) : [...value.tags, tag] });
  };
  const left = NOTE_MAX - value.note.length;
  return (
    <View style={styles.root}>
      <TextField
        label={t({ id: 'crew.composer.name', message: 'Their first name' })}
        value={value.name}
        onChangeText={(name) => onChange({ ...value, name })}
        testID="composer-name"
      />
      <TextField
        label={t({ id: 'crew.composer.phone', message: 'Their number (optional)' })}
        value={value.phone}
        onChangeText={(phone) => onChange({ ...value, phone })}
        message={
          homeHint === null
            ? t({
                id: 'crew.composer.phoneWhy',
                message: 'Only used to recognise them when they join.',
              })
            : t({
                id: 'crew.composer.homeHint',
                message: `Home guess from their number: ${homeHint}`,
              })
        }
        testID="composer-phone"
      />
      <TextField
        label={t({ id: 'crew.composer.note', message: 'A note about them' })}
        value={value.note}
        onChangeText={(note) => onChange({ ...value, note: note.slice(0, NOTE_MAX) })}
        message={t({
          id: 'crew.composer.noteLeft',
          message: `${left} left · “loves night markets, hates early starts”`,
        })}
        testID="composer-note"
      />
      <Text variant="eyebrow" color={theme.semantic.text.secondary}>
        {upper(t({ id: 'crew.composer.tags', message: 'What they’re into (up to 3)' }), locale)}
      </Text>
      <View style={styles.chips}>
        {TASTE_TAGS.map((tag) => (
          <ChoiceChip
            key={tag}
            label={upper(tagWords(tag).full, locale)}
            selected={value.tags.includes(tag)}
            onPress={() => toggle(tag)}
            testID={`composer-tag-${tag}`}
          />
        ))}
      </View>
    </View>
  );
}
