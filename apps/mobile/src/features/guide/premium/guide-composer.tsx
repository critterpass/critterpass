/**
 * The guide thread's foot (5.13, 5.14, 5.19, 5.20): the quick chips scrolling sideways, then the
 * composer with the menu camera behind `+` and the microphone (tap opens voice, hold talks at
 * once), or, once the answers are spent, the locked line with the time left, or the composer that
 * queues for midnight. Keyboard: the foot rides it; the return key sends.
 */
import { t } from '@lingui/core/macro';
import { forwardRef, type ComponentRef } from 'react';
import { ScrollView, View, type TextInput } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Composer,
  Icon,
  PressableScale,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';
import { useKeyboardFrame } from '@/ui/premium/shell';

import { Doodle, type DoodleName } from '@/features/crew';
import type { QuickAction } from '../chat/data/use-guide-sheet';
import type { MeterComposer } from './use-premium-guide-meter';

const DOODLES: Readonly<Record<string, DoodleName>> = {
  call_car: 'car',
  translate_menu: 'camera',
  pharmacy: 'pin',
  practise_phrases: 'chat',
  dietary: 'food',
};

const useStyles = makePremiumStyles((th) => ({
  chips: { paddingHorizontal: th.space.gap16, gap: th.space.gap8, paddingVertical: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space.gap6,
    height: 38,
    paddingStart: 6,
    paddingEnd: 13,
    borderRadius: 19,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.raised,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space.gap8,
    paddingHorizontal: th.space.gap12,
    paddingTop: th.space.gap8,
  },
  mic: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  locked: {
    flex: 1,
    height: 56,
    borderRadius: th.radius.composer,
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: th.color.controlDisabled,
  },
}));

export interface GuideComposerProps {
  readonly guideName: string;
  readonly quickActions: readonly QuickAction[];
  readonly meter: MeterComposer;
  readonly draft: string;
  readonly onDraft: (text: string) => void;
  readonly onSend: () => void;
  readonly busy: boolean;
  readonly offline: boolean;
  readonly onCamera?: () => void;
  readonly onMic?: () => void;
  readonly onMicHold?: () => void;
}

export const GuideComposer = forwardRef<ComponentRef<typeof TextInput>, GuideComposerProps>(
  function GuideComposer(props, ref) {
    const th = usePremiumTheme();
    const styles = useStyles();
    const insets = useSafeAreaInsets();
    const keyboard = useKeyboardFrame().height;
    const space = useAnimatedStyle(() => ({
      height: Math.max(keyboard.value, insets.bottom) + 8,
    }));
    const { meter } = props;
    const guide = props.guideName;
    let field;
    if (meter.kind === 'locked') {
      field = (
        <View
          style={styles.locked}
          accessible
          accessibilityLabel={meter.line}
          testID="guide-limit-composer"
        >
          <Text variant="body" tone="muted">
            {meter.line}
          </Text>
        </View>
      );
    } else if (meter.kind === 'queue') {
      field = (
        <View style={{ flex: 1 }}>
          <Composer
            ref={ref}
            value={meter.value}
            onChangeText={meter.onChange}
            placeholder={meter.placeholder}
            accessibilityLabel={meter.placeholder}
            onSend={meter.onSend}
            canSend={meter.value.trim() !== ''}
            sendLabel={t({ id: 'guide.premium.queueSend', message: 'Save for midnight' })}
            returnKeyType="send"
            onSubmitEditing={meter.onSend}
            testID="guide-limit-queue-composer"
          />
        </View>
      );
    } else {
      const placeholder = props.offline
        ? t({ id: 'guide.premium.placeholderOffline', message: 'Questions wait for signal' })
        : t({ id: 'guide.premium.placeholder', message: `Ask ${guide}` });
      field = (
        <View style={{ flex: 1 }}>
          <Composer
            ref={ref}
            value={props.draft}
            onChangeText={props.onDraft}
            placeholder={placeholder}
            accessibilityLabel={placeholder}
            onSend={props.onSend}
            canSend={props.draft.trim() !== '' && !props.busy}
            sendLabel={t({ id: 'guide.premium.send', message: 'Ask' })}
            returnKeyType="send"
            onSubmitEditing={props.onSend}
            {...(props.onCamera === undefined
              ? {}
              : {
                  add: {
                    onPress: props.onCamera,
                    label: t({ id: 'guide.premium.camera', message: 'Point the camera at a menu' }),
                  },
                })}
            testID="guide-composer"
          />
        </View>
      );
    }
    return (
      <View testID="guide-foot">
        {meter.kind === 'open' && props.quickActions.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            keyboardShouldPersistTaps="handled"
          >
            {props.quickActions.map((action) => (
              <PressableScale
                key={action.id}
                style={styles.chip}
                onPress={action.onPress}
                accessibilityRole="button"
                testID={`guide-quick-${action.id}`}
              >
                <Doodle
                  name={DOODLES[action.id] ?? 'spark'}
                  color={th.accent.tangerine}
                  size={26}
                />
                <Text variant="rowTextStrong">{action.label}</Text>
              </PressableScale>
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.row}>
          {field}
          {meter.kind === 'open' && props.onMic !== undefined ? (
            <PressableScale
              onPress={props.onMic}
              {...(props.onMicHold === undefined ? {} : { onLongPress: props.onMicHold })}
              accessibilityRole="button"
              accessibilityLabel={t({ id: 'guide.premium.talk', message: `Talk to ${guide}` })}
              testID="guide-mic"
              style={[styles.mic, { backgroundColor: th.color.ink }]}
            >
              <Icon name="mic" size={20} color={th.color.onInk} />
            </PressableScale>
          ) : null}
        </View>
        <Animated.View style={space} />
      </View>
    );
  },
);
