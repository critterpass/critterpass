/**
 * The pieces of the premium feedback form: the five mood critters (the picked one in colour on a
 * sun ring with a hop, the others silhouettes), the topic chips, and the pictures row (a thumbnail
 * with ✕, a dashed + while there is room for another).
 */
import { FEEDBACK_ATTACHMENTS_MAX, type FeedbackCategory, type FeedbackMood } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { Image, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { guideSticker } from '@/ui/premium/stickers/guides';
import {
  CritterSticker,
  Icon,
  PressableScale,
  SPRINGS,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { FEEDBACK_MOOD_ORDER, type Attachment } from '../feedback/draft';
import { MOOD_CRITTERS } from '../feedback/labels';

const MOOD_SIZE = 46;
const RING = MOOD_SIZE + 14;
const THUMB = 64;

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
  const th = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!picked || reduced) return;
    scale.value = withSequence(withSpring(1.12, SPRINGS.lively), withSpring(1, SPRINGS.lively));
  }, [picked, reduced, scale]);
  const hop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const critter = guideSticker(MOOD_CRITTERS[mood]);
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: picked }}
      accessibilityLabel={label}
      testID={`feedback-mood-${mood}`}
      style={{ alignItems: 'center', gap: th.space.gap4 }}
    >
      <Animated.View
        style={[
          {
            width: RING,
            height: RING,
            borderRadius: RING / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: picked ? th.accent.sun : th.color.card,
            boxShadow: th.shadow.card,
          },
          hop,
        ]}
      >
        {picked ? (
          <CritterSticker kind={critter.kind} name={critter.name} size={MOOD_SIZE} pose="cheer" />
        ) : (
          <CritterSticker
            kind={critter.kind}
            name={critter.name}
            size={MOOD_SIZE}
            variant="mask"
            maskColor={th.color.outlineEmpty}
          />
        )}
      </Animated.View>
      <Text
        variant="label"
        tone={picked ? 'ink' : 'muted'}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {label}
      </Text>
    </PressableScale>
  );
}

export function MoodPicker({
  value,
  labels,
  onPick,
}: {
  readonly value: FeedbackMood | null;
  readonly labels: Readonly<Record<FeedbackMood, string>>;
  readonly onPick: (mood: FeedbackMood) => void;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      style={{ flexDirection: 'row', justifyContent: 'space-between' }}
    >
      {FEEDBACK_MOOD_ORDER.map((mood) => (
        <MoodCritter
          key={mood}
          mood={mood}
          label={labels[mood]}
          picked={value === mood}
          onPress={() => onPick(mood)}
        />
      ))}
    </View>
  );
}

export function TopicChips({
  topics,
  value,
  labels,
  onPick,
}: {
  readonly topics: readonly FeedbackCategory[];
  readonly value: FeedbackCategory | null;
  readonly labels: Readonly<Record<FeedbackCategory, string>>;
  readonly onPick: (topic: FeedbackCategory) => void;
}) {
  const th = usePremiumTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.gap8 }}>
      {topics.map((topic) => {
        const on = value === topic;
        return (
          <PressableScale
            key={topic}
            onPress={() => onPick(topic)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={labels[topic]}
            testID={`feedback-topic-${topic}`}
            style={{
              minHeight: 36,
              justifyContent: 'center',
              paddingHorizontal: th.space.gap14,
              borderRadius: th.radius.pillSmall,
              backgroundColor: on ? th.color.ink : th.color.card,
              ...(on ? {} : { boxShadow: th.shadow.card }),
            }}
          >
            <Text variant="pillSmall" tone={on ? 'onInk' : 'ink'}>
              {labels[topic]}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

export function PicturesRow({
  attachments,
  onAdd,
  onRemove,
}: {
  readonly attachments: readonly Attachment[];
  readonly onAdd: () => void;
  readonly onRemove: (index: number) => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  return (
    <View style={{ flexDirection: 'row', gap: th.space.gap10 }}>
      {attachments.map((file, index) => (
        <View
          key={file.uri}
          style={{ width: THUMB, height: THUMB, borderRadius: th.radius.photoImage }}
        >
          <Image
            source={{ uri: file.uri }}
            style={{ width: THUMB, height: THUMB, borderRadius: th.radius.photoImage }}
            accessibilityIgnoresInvertColors
          />
          <PressableScale
            onPress={() => onRemove(index)}
            accessibilityRole="button"
            accessibilityLabel={t({
              id: 'help.feedback.removePhoto',
              message: 'Remove this picture',
            })}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            testID={`feedback-remove-${String(index)}`}
            style={{
              position: 'absolute',
              top: -6,
              end: -6,
              width: 24,
              height: 24,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: th.color.ink,
            }}
          >
            <Icon name="close" size={12} color={th.color.ground} />
          </PressableScale>
        </View>
      ))}
      {attachments.length < FEEDBACK_ATTACHMENTS_MAX ? (
        <PressableScale
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel={t({ id: 'help.feedback.addPhoto', message: 'Add a picture' })}
          testID="feedback-add-photo"
          style={{
            width: THUMB,
            height: THUMB,
            borderRadius: th.radius.photoImage,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: th.color.outlineEmpty,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="camera" size={20} color={th.color.muted} />
        </PressableScale>
      ) : null}
    </View>
  );
}
