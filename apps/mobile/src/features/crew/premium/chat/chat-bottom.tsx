/**
 * The chat's lower half (5.01, 5.06, 5.08): the timeline above, then the composer riding the
 * keyboard, and under it either the keyboard's space, the sticker tray at the keyboard's height, or
 * the home-indicator inset. The timeline shrinks with whichever is up, so the newest message stays
 * just above the composer. A member who left gets the read-only bar instead of the composer. The
 * keyboard's frames stay on the UI thread: the tray learns the keyboard's height once it settles.
 */
import { t } from '@lingui/core/macro';
import { useState, type ReactNode, type RefObject, type ComponentRef } from 'react';
import { View, type TextInput } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { REDUCED_FADE, SPRINGS, makePremiumStyles, usePremiumReducedMotion } from '@/ui/premium';
import { KeyboardDismissArea, useKeyboardFrame } from '@/ui/premium/shell';
import { shortName } from '@/lib/people/member-name';

import type { ChatMessage } from '../../chat/data/rows';
import type { StickerTray as TrayData, TraySticker } from '../../chat/data/use-sticker-tray';
import { ComposerBar, ComposerStrip } from './composer-bar';
import { ReadOnlyBar, RecorderBar } from './chat-panels';
import { StickerTray } from './sticker-tray';

/** The tray's height before the keyboard has ever shown on this screen. */
const DEFAULT_TRAY = 336;
const KEYBOARD_MIN = 120;

const useStyles = makePremiumStyles((th) => ({
  bar: {
    backgroundColor: th.color.ground,
    borderTopWidth: th.size.hairline,
    borderTopColor: th.color.hairline,
  },
  tray: { position: 'absolute', left: 0, right: 0, bottom: 0 },
}));

export interface ChatComposerState {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly placeholder: string;
  readonly canSend: boolean;
  readonly onSend: () => void;
  readonly trayOpen: boolean;
  readonly onToggleTray: () => void;
  readonly onFocus: () => void;
  readonly onAdd?: () => void;
  readonly onMicTap?: () => void;
  readonly onMicHoldStart?: () => void;
  readonly onMicHoldEnd?: () => void;
  readonly recording: boolean;
  readonly recorder: {
    readonly state: string;
    readonly elapsed: number;
    readonly send: () => void;
    readonly cancel: () => void;
  };
  readonly replyTo: ChatMessage | null;
  readonly editing: ChatMessage | null;
  readonly onCancelStrip: () => void;
}

export interface ChatBottomProps {
  readonly list: ReactNode;
  readonly former: boolean;
  readonly crewName: string;
  readonly onRejoin: () => void;
  readonly onRemove: () => void;
  /** The composer's field, kept apart from its state (a ref is never read while drawing). */
  readonly inputRef: RefObject<ComponentRef<typeof TextInput> | null>;
  readonly composer: ChatComposerState;
  readonly tray: TrayData;
  readonly onSendSticker: (sticker: TraySticker) => void;
  readonly onLockedSticker: (critterId: string) => void;
}

export function ChatBottom({ inputRef, ...props }: ChatBottomProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const reduced = usePremiumReducedMotion();
  const frame = useKeyboardFrame();
  const keyboard = frame.height;
  const [trayHeight, setTrayHeight] = useState(DEFAULT_TRAY);
  const tray = useSharedValue(DEFAULT_TRAY);
  const { composer } = props;
  // The tray takes the height the keyboard had once it was fully up, so swapping one for the other
  // never jumps. Only the settled height reaches React: one render per keyboard, not per frame.
  useAnimatedReaction(
    () => (frame.progress.get() >= 1 ? keyboard.get() : 0),
    (height, previous) => {
      if (height > KEYBOARD_MIN && height !== previous && height !== tray.get()) {
        tray.set(height);
        scheduleOnRN(setTrayHeight, height);
      }
    },
  );
  const open = composer.trayOpen;
  const space = useAnimatedStyle(() => {
    const target = Math.max(keyboard.get(), open ? tray.get() : insets.bottom);
    if (keyboard.get() > 0) return { height: target };
    return {
      height: reduced ? withTiming(target, REDUCED_FADE) : withSpring(target, SPRINGS.smooth),
    };
  }, [open, insets.bottom, reduced]);

  const replyName = shortName(composer.replyTo?.senderName);
  const strip =
    composer.editing !== null ? (
      <ComposerStrip
        title={t({ id: 'chat.premium.strip.editing', message: 'Editing' })}
        line={composer.editing.body}
        onCancel={composer.onCancelStrip}
      />
    ) : composer.replyTo !== null ? (
      <ComposerStrip
        title={t({
          id: 'chat.premium.strip.replying',
          message: `Replying to ${replyName}`,
        })}
        line={
          composer.replyTo.type === 'sticker'
            ? t({ id: 'chat.premium.strip.sticker', message: 'Sticker' })
            : composer.replyTo.body
        }
        onCancel={composer.onCancelStrip}
      />
    ) : undefined;

  return (
    <KeyboardDismissArea style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>{props.list}</View>
      {props.former ? (
        <ReadOnlyBar
          crewName={props.crewName}
          onRejoin={props.onRejoin}
          onRemove={props.onRemove}
        />
      ) : (
        <View style={styles.bar}>
          {composer.recorder.state === 'locked' ? (
            <RecorderBar
              elapsedMs={composer.recorder.elapsed}
              onSend={composer.recorder.send}
              onCancel={composer.recorder.cancel}
            />
          ) : null}
          <ComposerBar
            ref={inputRef}
            value={composer.value}
            onChangeText={composer.onChangeText}
            placeholder={composer.placeholder}
            canSend={composer.canSend}
            onSend={composer.onSend}
            trayOpen={composer.trayOpen}
            onToggleTray={composer.onToggleTray}
            onFocus={composer.onFocus}
            recording={composer.recording}
            above={strip}
            {...(composer.onAdd === undefined ? {} : { onAdd: composer.onAdd })}
            {...(composer.onMicTap === undefined ? {} : { onMicTap: composer.onMicTap })}
            {...(composer.onMicHoldStart === undefined
              ? {}
              : { onMicHoldStart: composer.onMicHoldStart })}
            {...(composer.onMicHoldEnd === undefined
              ? {}
              : { onMicHoldEnd: composer.onMicHoldEnd })}
          />
          <Animated.View style={[{ marginTop: 10 }, space]}>
            {open ? (
              <View style={[styles.tray, { height: trayHeight }]}>
                <StickerTray
                  tray={props.tray}
                  height={trayHeight}
                  bottomInset={insets.bottom}
                  onSend={props.onSendSticker}
                  onLocked={props.onLockedSticker}
                />
              </View>
            ) : null}
          </Animated.View>
        </View>
      )}
    </KeyboardDismissArea>
  );
}
