/**
 * Guide lab scenes for voice mode (3j-2): listening with a live transcript, thinking, the reply
 * spoken, a muted reply as text only, and each way a turn stops short (microphone off, nothing
 * heard, offline, questions spent, the reply failed, no speech module in this build).
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';
import { useSharedValue } from 'react-native-reanimated';

import { guideSticker } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';

import { VOICE_IDLE, type VoiceState } from '../voice-turn';
import { VoiceView } from '../voice-view';

const noop = () => undefined;
const HEARD = "It's pouring in Hội An. What can the six of us do instead?";
const REPLY =
  'From Hội An, the lantern workshop on Trần Phú is dry and takes all six of you. After that the covered market is two minutes on foot.';

function Scene({ state }: { readonly state: Partial<VoiceState> }) {
  const level = useSharedValue(state.phase === 'listening' ? 0.7 : 0.1);
  const sticker = guideSticker('tokek');
  return (
    <VoiceView
      guideName="Tokek"
      modeLine="Group mode · all 6 can see this"
      sticker={<Sticker kind={sticker.kind} name={sticker.name} size={96} />}
      state={{ ...VOICE_IDLE, ...state }}
      level={level}
      interruptBySpeech
      onTalk={noop}
      onSend={noop}
      onInterrupt={noop}
      onMuted={noop}
      onType={noop}
      onOpenSettings={noop}
    />
  );
}

export const VOICE_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'voice-idle': () => <Scene state={{}} />,
  'voice-listening': () => (
    <Scene state={{ phase: 'listening', heard: "It's pouring in Hội An" }} />
  ),
  'voice-thinking': () => <Scene state={{ phase: 'thinking', heard: HEARD }} />,
  'voice-speaking': () => (
    <Scene state={{ phase: 'speaking', heard: HEARD, reply: REPLY, spoken: true }} />
  ),
  'voice-muted-reply': () => <Scene state={{ heard: HEARD, reply: REPLY, muted: true }} />,
  'voice-mic-denied': () => <Scene state={{ issue: 'mic_denied' }} />,
  'voice-heard-nothing': () => <Scene state={{ issue: 'heard_nothing' }} />,
  'voice-offline': () => <Scene state={{ heard: HEARD, issue: 'offline_queued' }} />,
  'voice-quota': () => <Scene state={{ heard: HEARD, issue: 'quota' }} />,
  'voice-reply-failed': () => <Scene state={{ heard: HEARD, issue: 'reply_failed' }} />,
  'voice-no-module': () => <Scene state={{ issue: 'no_speech_module' }} />,
};
