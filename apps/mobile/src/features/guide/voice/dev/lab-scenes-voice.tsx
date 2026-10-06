/**
 * Guide lab scenes for voice mode (3j-2): listening with a live transcript, thinking, the reply
 * spoken, the reply with the changes it offers (to send to the group, and once sent), a reply
 * that could not be spoken, and each way a turn stops short (microphone off, nothing heard,
 * offline, questions spent, the reply failed, no speech module in this build), and the consent
 * step that comes before the first use (its yes opens voice mode, as on the device).
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { useState, type ReactNode } from 'react';
import { useSharedValue } from 'react-native-reanimated';

import { guideSticker } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';

import type { VoiceGroupSend } from '../voice-footer';
import type { VoiceSwap } from '../voice-swap-card';
import { VOICE_IDLE, type VoiceState } from '../voice-turn';
import { VoiceGate } from '../voice-consent-view';
import { VoiceView } from '../voice-view';

const noop = () => undefined;
const HEARD = "It's pouring in Hội An. What can the six of us do instead?";
const REPLY =
  'From Hội An, the lantern workshop on Trần Phú is dry and takes all six of you. After that the covered market is two minutes on foot.';

const SWAP_HEARD = "It's pouring in Hội An. What now?";
const SWAP_REPLY = 'Rain till three. Two dry swaps, and dinner stays at 19:30.';
const SWAPS: readonly VoiceSwap[] = [
  {
    id: 'lantern',
    title: 'Lantern workshop, Trần Phú',
    detail: 'Indoors · 6 seats held for 20 min',
    delta: '+$18',
  },
  {
    id: 'museum',
    title: 'Museum of Folk Culture',
    detail: '10 min walk · covered courtyard',
    delta: '+$4',
  },
];

function Scene({
  state,
  swaps = [],
  group = null,
}: {
  readonly state: Partial<VoiceState>;
  readonly swaps?: readonly VoiceSwap[];
  readonly group?: VoiceGroupSend['status'] | null;
}) {
  const level = useSharedValue(state.phase === 'listening' ? 0.7 : 0.1);
  const sticker = guideSticker('tokek');
  return (
    <VoiceView
      guideName="Tokek"
      shared
      sticker={<Sticker kind={sticker.kind} name={sticker.name} size={96} />}
      state={{ ...VOICE_IDLE, ...state }}
      level={level}
      swaps={swaps}
      costs={[]}
      group={group === null ? null : { status: group, busy: false, onSend: noop }}
      onTalk={noop}
      onSend={noop}
      onInterrupt={noop}
      onType={noop}
      onOpenSettings={noop}
    />
  );
}

function ConsentScene() {
  const [granted, setGranted] = useState(false);
  const sticker = guideSticker('tokek');
  return (
    <VoiceGate
      status={granted ? 'granted' : 'needed'}
      guideName="Tokek"
      sticker={<Sticker kind={sticker.kind} name={sticker.name} size={96} />}
      onAgree={() => setGranted(true)}
      onType={noop}
    >
      <Scene state={{}} />
    </VoiceGate>
  );
}

export const VOICE_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'voice-swaps': () => (
    <Scene
      state={{ phase: 'listening', heard: SWAP_HEARD, reply: SWAP_REPLY, spoken: true }}
      swaps={SWAPS}
      group="open"
    />
  ),
  'voice-swaps-sent': () => (
    <Scene
      state={{ heard: SWAP_HEARD, reply: SWAP_REPLY, spoken: true }}
      swaps={SWAPS}
      group="sent"
    />
  ),
  'voice-idle': () => <Scene state={{}} />,
  'voice-listening': () => (
    <Scene state={{ phase: 'listening', heard: "It's pouring in Hội An" }} />
  ),
  'voice-thinking': () => <Scene state={{ phase: 'thinking', heard: HEARD }} />,
  'voice-speaking': () => (
    <Scene state={{ phase: 'speaking', heard: HEARD, reply: REPLY, spoken: true }} />
  ),
  'voice-text-only': () => <Scene state={{ heard: HEARD, reply: REPLY }} />,
  'voice-mic-denied': () => <Scene state={{ issue: 'mic_denied' }} />,
  'voice-heard-nothing': () => <Scene state={{ issue: 'heard_nothing' }} />,
  'voice-offline': () => <Scene state={{ heard: HEARD, issue: 'offline_queued' }} />,
  'voice-quota': () => <Scene state={{ heard: HEARD, issue: 'quota' }} />,
  'voice-reply-failed': () => <Scene state={{ heard: HEARD, issue: 'reply_failed' }} />,
  'voice-no-module': () => <Scene state={{ issue: 'no_speech_module' }} />,
  'voice-consent': () => <ConsentScene />,
};
