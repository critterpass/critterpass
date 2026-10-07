import { useLocalSearchParams } from 'expo-router';

import { ChatLabScene } from '@/features/crew/chat/dev/lab-scene';
import { HELP_SCENES, ShakeOver } from '@/features/help/dev/lab-scenes';
import { MONEY_LAB_SCENES } from '@/features/money/dev/lab-scenes';
import { SessionMapNoPackScene } from '@/features/safety/session-map/dev/session-map-scene';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** Safety has no lab of its own: its scene is listed with the help centre's. */
const SAFETY_SCENE = 'sos-map-no-pack';

/** One help centre lab scene, full screen; back returns to the list. */
export default function HelpSceneRoute() {
  const { scene } = useLocalSearchParams<{ scene: string }>();
  if (scene === SAFETY_SCENE) return <SessionMapNoPackScene />;
  // A shake over another area's screen: what that screen marks private is covered in the picture.
  if (scene === 'shake-wallet') return <ShakeOver>{MONEY_LAB_SCENES['balances']?.()}</ShakeOver>;
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
