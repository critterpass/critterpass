/**
 * A video in the viewer: it waits until the traveller presses play (so it never starts with sound
 * by itself), then plays in place with the player's own pause and scrub bar. It pauses when paged
 * away from. A phone without the native player shows the video's still instead.
 */
import { requireOptionalNativeModule } from 'expo';
import type { useVideoPlayer as UseVideoPlayer, VideoView as VideoViewType } from 'expo-video';
import { useEffect } from 'react';
import { Image, StyleSheet } from 'react-native';

interface ExpoVideo {
  readonly useVideoPlayer: typeof UseVideoPlayer;
  readonly VideoView: typeof VideoViewType;
}

const NATIVE_PLAYER = requireOptionalNativeModule('ExpoVideo') !== null;

// Loaded only where the native module exists: the package's entry requires it at import time.
const expoVideo: ExpoVideo | null = NATIVE_PLAYER
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded optional native module
    (require('expo-video') as ExpoVideo)
  : null;

export interface LightboxVideoProps {
  readonly uri: string;
  readonly poster?: string | undefined;
  readonly active: boolean;
  readonly label: string;
}

function NativeVideo({
  uri,
  active,
  label,
  lib,
}: LightboxVideoProps & { readonly lib: ExpoVideo }) {
  const player = lib.useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.showNowPlayingNotification = false;
  });
  useEffect(() => {
    if (!active) player.pause();
  }, [active, player]);
  const { VideoView } = lib;
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      nativeControls
      allowsPictureInPicture={false}
      accessibilityLabel={label}
      testID="lightbox-video"
    />
  );
}

export function LightboxVideo(props: LightboxVideoProps) {
  if (expoVideo !== null) return <NativeVideo {...props} lib={expoVideo} />;
  return props.poster === undefined ? null : (
    <Image
      source={{ uri: props.poster }}
      resizeMode="contain"
      style={StyleSheet.absoluteFill}
      accessibilityLabel={props.label}
      accessibilityIgnoresInvertColors
      testID="lightbox-video-still"
    />
  );
}
