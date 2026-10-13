import { useLocalSearchParams } from 'expo-router';

import { ChatLabScene } from '@/features/crew/chat/dev/lab-scene';
import { ShakeOver, ShakeReportScene } from '@/features/help/dev/shake-scenes';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** One shake-to-report lab scene, full screen; back returns to the list. */
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
  return scene === 'shake-report' ? <ShakeReportScene /> : null;
}
