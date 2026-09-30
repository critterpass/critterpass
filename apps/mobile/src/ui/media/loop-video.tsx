/**
 * The video loop player behind a media layer. Without a native video player on the device a
 * video asset shows its poster still: the layer keeps drawing the still whenever this renders
 * nothing.
 */
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

/** Whether this app can play loops at all. */
export function loopPlayerAvailable(): boolean {
  return false;
}

export function LoopVideo(_props: LoopVideoProps) {
  return null;
}
