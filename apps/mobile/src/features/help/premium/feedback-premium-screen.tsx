/**
 * Send feedback in the premium look: pushed from Help (or an article, or a shake) with the glass
 * back. The title says which kind of note it is, five mood critters, the topic chips (Bug first in
 * a problem report), the note, up to three pictures and "Device info" with the real OS and app
 * version, on by default. Send stays off until there are a few words, or a mood and a topic. A note
 * with words or pictures asks before it is dropped.
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  ListCard,
  Row,
  StatusTag,
  Text,
  TextField,
  Toggle,
  usePremiumTheme,
} from '@/ui/premium';
import { confirmAlert, KeyboardStickyFooter, PushScreen } from '@/ui/premium/shell';

import { useFeedbackLabels } from '../feedback/labels';
import { useFeedbackForm } from '../feedback/use-feedback-form';
import { MoodPicker, PicturesRow, TopicChips } from './feedback-premium-parts';

export function FeedbackPremiumScreen() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const form = useFeedbackForm();
  const { moods, topics } = useFeedbackLabels();
  const { draft, leaving, stay, leave } = form;

  useEffect(() => {
    if (!leaving) return;
    void confirmAlert({
      title: t({ id: 'help.feedback.discardTitle', message: 'Leave without sending?' }),
      message: t({
        id: 'help.feedback.discardLine',
        message: 'Your note and its photos are dropped.',
      }),
      confirm: t({ id: 'help.feedback.discard', message: 'Leave' }),
      cancel: t({ id: 'help.premium.feedbackKeep', message: 'Keep writing' }),
    }).then((drop) => (drop ? leave() : stay()));
  }, [leaving, leave, stay, t]);

  const title =
    form.mode === 'problem'
      ? t({ id: 'help.feedback.titleProblem', message: 'Report a problem' })
      : form.mode === 'idea'
        ? t({ id: 'help.feedback.titleIdea', message: 'Suggest a feature' })
        : t({ id: 'help.feedback.title', message: 'Send feedback' });
  const placeholder =
    form.mode === 'problem'
      ? t({
          id: 'help.feedback.placeholderProblem',
          message: 'What happened, and what did you expect?',
        })
      : form.mode === 'idea'
        ? t({ id: 'help.feedback.placeholderIdea', message: 'What should CritterPass do next?' })
        : t({ id: 'help.feedback.placeholder', message: 'What you love, what bugs you…' });

  return (
    <PushScreen
      title={title}
      subtitle={t({ id: 'help.feedback.toHumans', message: 'To the humans' })}
      backLabel={t({ id: 'help.feedback.back', message: 'Help' })}
      scroll={false}
      testID="help-feedback"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: th.space.gutter,
          paddingBottom: th.space.gap16,
          gap: th.space.gap14,
        }}
      >
        <Text variant="headline" accessibilityRole="header">
          {t({ id: 'help.feedback.howsItGoing', message: 'How’s it going?' })}
        </Text>
        <MoodPicker value={draft.mood} labels={moods} onPick={form.onMood} />
        <Text variant="headline" accessibilityRole="header" style={{ marginTop: th.space.gap6 }}>
          {t({ id: 'help.feedback.about', message: 'About' })}
        </Text>
        <TopicChips
          topics={form.topics}
          value={draft.category}
          labels={topics}
          onPick={form.onTopic}
        />
        {form.articleTitle === null ? null : (
          <View style={{ alignSelf: 'flex-start' }}>
            <StatusTag
              tone="unopened"
              label={t({
                id: 'help.feedback.fromArticle',
                message: `From “${form.articleTitle}”`,
              })}
              testID="feedback-article"
            />
          </View>
        )}
        <TextField
          accessibilityLabel={t({ id: 'help.feedback.note', message: 'Your note' })}
          value={draft.text}
          onChangeText={form.onText}
          placeholder={placeholder}
          multiline
          maxLength={4000}
          testID="feedback-text"
        />
        <PicturesRow
          attachments={draft.attachments}
          onAdd={form.onAddPhoto}
          onRemove={form.onRemovePhoto}
        />
        {form.tooBigNote ? (
          <Text variant="caption" color={th.color.destructive.helper} testID="feedback-too-big">
            {t({
              id: 'help.feedback.tooBig',
              message: 'That picture is too big to send. Try a screenshot instead.',
            })}
          </Text>
        ) : null}
        <ListCard>
          <Row
            title={t({ id: 'help.feedback.device', message: 'Device info' })}
            subtitle={form.deviceLine}
            trailing={
              <Toggle
                value={draft.includeDeviceInfo}
                onChange={form.onDeviceInfo}
                accessibilityLabel={t({
                  id: 'help.feedback.includeDevice',
                  message: 'Include device info',
                })}
                testID="feedback-device-info"
              />
            }
          />
        </ListCard>
      </ScrollView>
      <KeyboardStickyFooter>
        <View
          style={{
            paddingHorizontal: th.space.gutter,
            paddingTop: th.space.gap8,
            paddingBottom: Math.max(insets.bottom, th.space.gap12),
          }}
        >
          <Button
            label={t({ id: 'help.feedback.send', message: 'Send it' })}
            onPress={form.onSend}
            disabled={!form.canSend}
            loading={form.sending}
            testID="feedback-send"
          />
        </View>
      </KeyboardStickyFooter>
    </PushScreen>
  );
}
