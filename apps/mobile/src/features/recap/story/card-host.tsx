/** One story card on screen: its recorded voice while it is up, and the hold for a line still speaking. */
import { useEffect, useState, type RefObject } from 'react';
import { View } from 'react-native';
import { useStoryClock } from '@/ui/story/story-clock';
import { type CardView } from './share-card-image';
import type { StoryCardSpec } from './story-cards';
import { useNarration, type VoiceUrlLoader } from './use-narration';
import { useVoiceWait } from './use-voice-wait';

export interface CardHostProps {
  readonly spec: StoryCardSpec;
  readonly voiceOn: boolean;
  /** A sheet is over the story, or the app is not in front: the voice stops with the bar. */
  readonly frozen: boolean;
  /** The card is holding its last moment for the voice line. */
  readonly onVoiceHold: (holding: boolean) => void;
  readonly loadVoiceUrl: VoiceUrlLoader | undefined;
  /** The card's own view, for its picture. */
  readonly cardRef: RefObject<CardView | null>;
}

export function CardHost({
  spec,
  voiceOn,
  frozen,
  onVoiceHold,
  loadVoiceUrl,
  cardRef,
}: CardHostProps) {
  const clock = useStoryClock();
  const [speaking, setSpeaking] = useState(false);
  const holding = useVoiceWait(speaking, spec.durationMs);
  // The hold for the voice stops the bar, not the voice it is waiting for.
  useNarration(
    spec.narrationKey,
    voiceOn,
    frozen || (clock.paused && !holding),
    setSpeaking,
    loadVoiceUrl,
  );
  useEffect(() => {
    onVoiceHold(holding);
    return () => onVoiceHold(false);
  }, [holding, onVoiceHold]);
  return (
    <View ref={cardRef} collapsable={false} style={FILL}>
      {spec.content}
    </View>
  );
}

const FILL = { flex: 1 } as const;
