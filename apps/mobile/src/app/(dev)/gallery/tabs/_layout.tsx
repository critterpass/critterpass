import { useEffect } from 'react';

import type { ScreenRoute } from '@/lib/navigation/screen-registry';
import { isScreenRegistered, registerScreens } from '@/lib/navigation/screen-registry';
import { GUIDE_SHEET_SCREEN, HELP_HUB_SCREEN } from '@/ui/shell/GuideFab';
import { ShellTabs } from '@/ui/shell/ShellTabs';

export const __CP_DEV_ROUTE__ = true;

/**
 * Shell demo of the real tab bar and `tab` transition over four demo tab screens. While mounted,
 * and only when the guide and help areas haven't registered their own screens yet, the FAB's two
 * screen ids point at the gallery's shell-target screen so its tap and long-press can be exercised.
 */
export default function GalleryTabsLayout() {
  useEffect(() => {
    const demo: Record<string, ScreenRoute> = {};
    for (const [id, target] of [
      [GUIDE_SHEET_SCREEN, 'guide'],
      [HELP_HUB_SCREEN, 'help'],
    ] as const) {
      if (!isScreenRegistered(id)) {
        demo[id] = { pathname: '/(dev)/gallery/shell-target', params: { target } };
      }
    }
    return registerScreens(demo);
  }, []);

  return <ShellTabs gated={false} />;
}
