import { useLocalSearchParams } from 'expo-router';

import { ChatLabScene } from '@/features/crew/chat/dev/lab-scene';
import { HELP_SCENES, ShakeOver } from '@/features/help/dev/lab-scenes';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** One help centre lab scene, full screen; back returns to the list. */
export default function HelpSceneRoute() {
  const { scene } = useLocalSearchParams<{ scene: string }>();
  // A shake over another area's screen: what that screen marks private is covered in the picture.
  if (scene === 'shake-chat') {
    return (
      <ShakeOver>
        <ChatLabScene />
      </ShakeOver>
    );
  }
  const render = HELP_SCENES[typeof scene === 'string' ? scene : ''];
  return render === undefined ? null : render();
}
