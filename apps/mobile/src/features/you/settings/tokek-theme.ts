/** Tokek's theme for Settings' easter egg: his short theme sample, at the music volume, once. */
import { createAudioPlayer } from 'expo-audio';

import { getFeedbackPrefsSnapshot } from '@/motion/feedback/prefs';
import { music } from '@/motion/music';

export function playTokekTheme(): void {
  const prefs = getFeedbackPrefsSnapshot();
  const sample = music.themeFor('tokek')?.sampleAsset;
  if (!prefs.musicEnabled || sample === undefined) return;
  const player = createAudioPlayer(sample);
  player.volume = prefs.musicVolume;
  const done = player.addListener('playbackStatusUpdate', (status) => {
    if (!status.didJustFinish) return;
    done.remove();
    player.release();
  });
  player.play();
}
