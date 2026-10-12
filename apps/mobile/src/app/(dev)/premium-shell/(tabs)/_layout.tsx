import { router } from 'expo-router';

import { PremiumTabs } from '@/ui/premium/shell';

/**
 * The demo's tabs: a LegendList and a FlashList under native large titles (does the iOS 26 bar
 * minimise and the title collapse with these lists?), a tab with the drawn header, and the guide
 * circle opening a sheet instead of a tab.
 */
export default function PremiumShellTabs() {
  return (
    <PremiumTabs
      gated={false}
      tabs={[
        { name: 'legend', icon: 'home', label: 'Legend' },
        { name: 'flash', icon: 'trips', label: 'Flash' },
        { name: 'drawn', icon: 'pass', label: 'Drawn' },
      ]}
      guideRoute="guide-circle"
      guide={{ ask: () => router.push('/(dev)/premium-shell/guide'), help: undefined }}
    />
  );
}
