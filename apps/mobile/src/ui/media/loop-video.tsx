/**
 * The video loop behind a media layer: an 8-second muted mp4 on repeat (mixing with whatever the
 * traveller is listening to, never taking audio focus), tinted to the hero's accent the way the
 * still is, faded in over the poster once its first frame is on screen. A device without the
 * native video player (an app installed before it shipped) renders nothing, and the layer keeps
 * showing the poster still.
 */
import { requireOptionalNativeModule } from 'expo';
import type { useVideoPlayer as UseVideoPlayer, VideoView as VideoViewType } from 'expo-video';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { MediaVideo } from '@/lib/media/variants';

export interface LoopVideoProps {
  readonly video: MediaVideo;
  /** A saved copy of the loop on the device, when there is one. */
  readonly localUri: string | null;
  /** The hero's accent: the loop is tinted to it the way the still is. */
  readonly tint: string;
  /** Opacity of the tinted loop over the flood (the still's). */
  readonly opacity: number;
}

const NATIVE_PLAYER = requireOptionalNativeModule('ExpoVideo') !== null;

/** Whether this app can play loops at all. */
export function loopPlayerAvailable(): boolean {
  return NATIVE_PLAYER;
}

interface ExpoVideo {
  readonly useVideoPlayer: typeof UseVideoPlayer;
  readonly VideoView: typeof VideoViewType;
}

// Loaded only where the native module exists: the package's entry requires it at import time.
const expoVideo: ExpoVideo | null = NATIVE_PLAYER
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded optional native module
    (require('expo-video') as ExpoVideo)
  : null;

function NativeLoop({
  video,
  localUri,
  tint,
  opacity,
  player: lib,
}: LoopVideoProps & {
  readonly player: ExpoVideo;
}) {
  const [shown, setShown] = useState(false);
  const player = lib.useVideoPlayer(localUri ?? video.url, (p) => {
    p.loop = true;
    p.muted = true;
    p.audioMixingMode = 'mixWithOthers';
    p.showNowPlayingNotification = false;
    p.play();
  });
  const { VideoView } = lib;
  return (
    <View style={[StyleSheet.absoluteFill, { opacity: shown ? opacity : 0 }]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
        onFirstFrameRender={() => setShown(true)}
      />
      {/* Hue and saturation of the accent over the loop's own lightness: its duotone. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, mixBlendMode: 'color' }]} />
    </View>
  );
}

export function LoopVideo(props: LoopVideoProps) {
  return expoVideo === null ? null : <NativeLoop {...props} player={expoVideo} />;
}
