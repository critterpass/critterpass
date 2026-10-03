/**
 * Send feedback (3p-2): ← HELP and TO THE HUMANS, five mood critters (the picked one in colour on a
 * yellow ring with a hop, the others grey silhouettes), the ABOUT chips (BUG first in a problem
 * report), the note, attachments (a thumbnail with ×, a dashed + for up to three) and "Device info"
 * with the real OS and app version, on by default. SEND IT stays off until there are a few words, or
 * a mood and a topic.
 */
import { useLingui } from '@lingui/react/macro';
import type { FeedbackCategory, FeedbackMood } from '@cp/domain';
import { Image, Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { patterns } from '@/motion';
import { GUIDE_STICKERS, type GuideStickerId } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { DashedAddCard } from '@/ui/cards/DashedAddCard';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { InfoPill } from '@/ui/chips/InfoPill';
import { TextField } from '@/ui/inputs/TextField';
import { Toggle } from '@/ui/inputs/Toggle';
import { KeyboardFooter } from '@/ui/layout/KeyboardFooter';
import { KeyboardScrollView } from '@/ui/layout/KeyboardScrollView';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { FeedbackMode } from '../routes';
import { FEEDBACK_MOOD_ORDER, type FeedbackDraft } from './draft';
import { useFeedbackLabels } from './labels';

/** The critter that wears each mood. */
const MOOD_CRITTERS: Readonly<Record<FeedbackMood, GuideStickerId>> = {
  grr: 'ajo',
  meh: 'pon',
  okay: 'sardi',
  good: 'tokek',
  love: 'paco',
};

const MOOD_SIZE = 52;

export interface FeedbackViewProps {
  readonly mode: FeedbackMode;
  readonly draft: FeedbackDraft;
  readonly topics: readonly FeedbackCategory[];
  readonly deviceLine: string;
  readonly canSend: boolean;
  readonly sending: boolean;
  /** A picked file was over the size an attachment may be. */
  readonly tooBigNote: boolean;
  /** The article this came from ("Still stuck? Ask a human"). */
  readonly articleTitle: string | null;
  readonly onMood: (mood: FeedbackMood) => void;
  readonly onTopic: (topic: FeedbackCategory) => void;
  readonly onText: (text: string) => void;
  readonly onAddPhoto: () => void;
  readonly onRemovePhoto: (index: number) => void;
  readonly onDeviceInfo: (on: boolean) => void;
  readonly onSend: () => void;
  readonly onBack: () => void;
}

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, gap: t.space['16'] },
  header: { justifyContent: 'space-between', alignItems: 'center' },
  humans: {
    backgroundColor: t.semantic.bg.control,
    borderRadius: t.radius.pill,
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['4'],
  },
  moods: { justifyContent: 'space-between' },
  mood: { alignItems: 'center', gap: t.space['4'] },
  ring: {
    width: MOOD_SIZE + 12,
    height: MOOD_SIZE + 12,
    borderRadius: (MOOD_SIZE + 12) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.semantic.bg.raised,
  },
  picked: { backgroundColor: t.color.yellow, borderWidth: 2, borderColor: t.semantic.text.primary },
  chips: { flexWrap: 'wrap', gap: t.space['8'] },
  attachments: { alignItems: 'center', gap: t.space['10'] },
  thumb: { width: 64, height: 80, borderRadius: t.radius.md, overflow: 'hidden' },
  thumbImage: { width: '100%', height: '100%' },
  remove: {
    position: 'absolute',
    top: 2,
    end: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.semantic.text.primary,
  },
  device: { flex: 1, gap: t.space['2'] },
}));

function MoodCritter({
  mood,
  label,
  picked,
  onPress,
}: {
  readonly mood: FeedbackMood;
  readonly label: string;
  readonly picked: boolean;
  readonly onPress: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const hop = patterns.useSquash({ active: picked });
  const critter = GUIDE_STICKERS[MOOD_CRITTERS[mood]];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: picked }}
      accessibilityLabel={label}
      testID={`feedback-mood-${mood}`}
      style={styles.mood}
    >
      <Animated.View style={[styles.ring, picked ? styles.picked : null, picked ? hop : null]}>
        {picked ? (
          <Sticker kind={critter.kind} name={critter.name} size={MOOD_SIZE} />
        ) : (
          <Sticker
            kind={critter.kind}
            name={critter.name}
            size={MOOD_SIZE}
            variant="mask"
            maskColor={theme.semantic.bg.control}
            sticker={null}
          />
        )}
      </Animated.View>
      <Text
        variant="label"
        color={picked ? theme.color.yellow : theme.semantic.text.secondary}
        accessibilityElementsHidden
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function FeedbackView(props: FeedbackViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const { draft } = props;
  const { moods, topics } = useFeedbackLabels();
  const title =
    props.mode === 'problem'
      ? t({ id: 'help.feedback.titleProblem', message: 'Report a problem' })
      : props.mode === 'idea'
        ? t({ id: 'help.feedback.titleIdea', message: 'Suggest a feature' })
        : t({ id: 'help.feedback.title', message: 'Send feedback' });
  const placeholder =
    props.mode === 'problem'
      ? t({
          id: 'help.feedback.placeholderProblem',
          message: 'What happened, and what did you expect?',
        })
      : props.mode === 'idea'
        ? t({ id: 'help.feedback.placeholderIdea', message: 'What should CritterPass do next?' })
        : t({ id: 'help.feedback.placeholder', message: 'What you love, what bugs you…' });
  return (
    <Scaffold variant="dark" edges={['top']} testID="help-feedback">
      <KeyboardScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Row style={styles.header}>
          <BackEyebrow
            label={t({ id: 'help.feedback.back', message: 'Help' })}
            onPress={props.onBack}
            testID="help-feedback-back"
          />
          <View style={styles.humans}>
            <Text variant="label">
              {t({ id: 'help.feedback.toHumans', message: 'To the humans' }).toUpperCase()}
            </Text>
          </View>
        </Row>
        <Text variant="h1" accessibilityRole="header">
          {title.toUpperCase()}
        </Text>
        <Stack gap="8">
          <Text variant="eyebrow" accessibilityRole="header">
            {t({ id: 'help.feedback.howsItGoing', message: 'How’s it going?' })}
          </Text>
          <Row style={styles.moods} accessibilityRole="radiogroup">
            {FEEDBACK_MOOD_ORDER.map((mood) => (
              <MoodCritter
                key={mood}
                mood={mood}
                label={moods[mood].toUpperCase()}
                picked={draft.mood === mood}
                onPress={() => props.onMood(mood)}
              />
            ))}
          </Row>
        </Stack>
        <Stack gap="8">
          <Text variant="eyebrow" accessibilityRole="header">
            {t({ id: 'help.feedback.about', message: 'About' })}
          </Text>
          <Row style={styles.chips}>
            {props.topics.map((topic) => (
              <ChoiceChip
                key={topic}
                label={topics[topic].toUpperCase()}
                selected={draft.category === topic}
                onPress={() => props.onTopic(topic)}
                testID={`feedback-topic-${topic}`}
              />
            ))}
          </Row>
        </Stack>
        {props.articleTitle === null ? null : (
          <InfoPill icon="pin" testID="feedback-article">
            {t({ id: 'help.feedback.fromArticle', message: `From “${props.articleTitle}”` })}
          </InfoPill>
        )}
        <TextField
          label={t({ id: 'help.feedback.note', message: 'Your note' })}
          labelHidden
          value={draft.text}
          onChangeText={props.onText}
          placeholder={placeholder}
          multiline
          maxLines={8}
          maxLength={4000}
          clearable={false}
          testID="feedback-text"
        />
        <Row style={styles.attachments}>
          {draft.attachments.map((file, index) => (
            <View key={file.uri} style={styles.thumb}>
              <Image
                source={{ uri: file.uri }}
                style={styles.thumbImage}
                accessibilityIgnoresInvertColors
              />
              <Pressable
                onPress={() => props.onRemovePhoto(index)}
                accessibilityRole="button"
                accessibilityLabel={t({
                  id: 'help.feedback.removePhoto',
                  message: 'Remove this picture',
                })}
                hitSlop={8}
                style={styles.remove}
                testID={`feedback-remove-${String(index)}`}
              >
                <Text variant="label" color={theme.semantic.bg.base}>
                  ×
                </Text>
              </Pressable>
            </View>
          ))}
          {draft.attachments.length < 3 ? (
            <DashedAddCard
              label={t({ id: 'help.feedback.addPhoto', message: 'Add a picture' })}
              onPress={props.onAddPhoto}
              size={64}
              testID="feedback-add-photo"
            />
          ) : null}
          <View style={styles.device}>
            <Text variant="title">{t({ id: 'help.feedback.device', message: 'Device info' })}</Text>
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {props.deviceLine}
            </Text>
          </View>
          <Toggle
            value={draft.includeDeviceInfo}
            onValueChange={props.onDeviceInfo}
            label={t({ id: 'help.feedback.includeDevice', message: 'Include device info' })}
            testID="feedback-device-info"
          />
        </Row>
        {props.tooBigNote ? (
          <Text variant="bodySm" color={theme.semantic.text.secondary} testID="feedback-too-big">
            {t({
              id: 'help.feedback.tooBig',
              message: 'That picture is too big to send. Try a screenshot instead.',
            })}
          </Text>
        ) : null}
      </KeyboardScrollView>
      <KeyboardFooter>
        <PillButton
          label={t({ id: 'help.feedback.send', message: 'Send it' }).toUpperCase()}
          onPress={props.onSend}
          disabled={!props.canSend || props.sending}
          testID="feedback-send"
        />
      </KeyboardFooter>
    </Scaffold>
  );
}
