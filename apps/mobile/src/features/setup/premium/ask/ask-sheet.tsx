/**
 * The guide's private ask about a maybe block, in the premium look (undesigned; a native sheet
 * built from the kit): the guide's line, what the organiser learns, "Freed it" and "Can't move
 * it", or a few words with Send. Once answered, the guide's thanks.
 */
import type { AskAnswer } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { guideSticker } from '@/ui/premium/stickers/guides';
import { Button, GuideNote, Text, TextButton, TextField, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import type { AskSheetViewProps } from '../../when/ask-sheet';

const FREED: AskAnswer = 'freed';
// eslint-disable-next-line lingui/no-unlocalized-strings -- a wire value, never copy.
const NOT_MOVABLE: AskAnswer = 'not_movable';

export function PremiumAskSheetView(props: AskSheetViewProps) {
  const { place, organiser, sent, busy } = props;
  const theme = usePremiumTheme();
  const [words, setWords] = useState('');
  const guide = guideSticker(props.guide);
  const name = guide.name;
  const note = (text: string) => <GuideNote name={guide.name} critter={guide.kind} text={text} />;
  return (
    <SheetScreen
      title={t({ id: 'setup.ask.title', message: 'About your maybe days' })}
      cancelLabel={
        sent
          ? t({ id: 'setup.sheet.close', message: 'Close' })
          : t({ id: 'setup.premium.cancel', message: 'Cancel' })
      }
      dirty={!sent && words.trim() !== ''}
      discardPrompt={{
        title: t({ id: 'setup.premium.ask.discardTitle', message: 'Drop what you wrote?' }),
        message: t({
          id: 'setup.premium.ask.discardLine',
          message: `Your words aren’t sent to ${name}.`,
        }),
        discard: t({ id: 'setup.premium.discard', message: 'Discard' }),
        keep: t({ id: 'setup.premium.keepEditing', message: 'Keep editing' }),
      }}
      testID="ask-sheet"
    >
      <View style={[styles.body, { paddingHorizontal: theme.space.gutter }]}>
        {sent ? (
          note(
            t({
              id: 'setup.ask.thanks',
              message: `Thanks. I’ll only tell ${organiser} whether the week works.`,
            }),
          )
        ) : (
          <>
            {note(
              t({
                id: 'setup.ask.line',
                message: `Quick one: your maybe block is the only thing between the crew and ${place}. Could you free it?`,
              }),
            )}
            <Text variant="rowText" tone="muted">
              {t({
                id: 'setup.ask.privacy',
                message: `${organiser} only hears whether the week works. Never what the block is.`,
              })}
            </Text>
            <Button
              label={t({ id: 'setup.ask.freed', message: 'Freed it' })}
              loading={busy}
              onPress={() => props.onAnswer(FREED)}
              testID="ask-freed"
            />
            <Button
              label={t({ id: 'setup.ask.notMovable', message: 'Can’t move it' })}
              variant="secondary"
              disabled={busy}
              onPress={() => props.onAnswer(NOT_MOVABLE)}
              testID="ask-not-movable"
            />
            <TextField
              placeholder={t({
                id: 'setup.ask.words',
                message: `Or tell ${name} in your words`,
              })}
              accessibilityLabel={t({
                id: 'setup.ask.words',
                message: `Or tell ${name} in your words`,
              })}
              value={words}
              onChangeText={(next) => setWords(next.slice(0, 500))}
              multiline
              testID="ask-words"
            />
            <View style={styles.end}>
              <TextButton
                label={t({ id: 'setup.ask.send', message: 'Send' })}
                onPress={() => props.onWords(words.trim())}
                disabled={busy || words.trim() === ''}
                testID="ask-send"
              />
            </View>
          </>
        )}
      </View>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12, paddingTop: 8, paddingBottom: 24 },
  end: { alignItems: 'flex-end' },
});
