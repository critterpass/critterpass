import { sheetScreens } from '@/lib/navigation/sheet-routes';
import { sheetRouteOptions } from '@/ui/premium/shell';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';
import { SessionGate } from '@/ui/premium/shell/session-gate';

/**
 * Explore pages pushed from Home, a trip or a link (screens owned by the explore area);
 * session-only. A native stack, so the place page's push and edge swipe are native, and "Why am I
 * seeing this?" is a native form sheet as tall as its words.
 */
export default function ExploreLayout() {
  return (
    <SessionGate>
      <PremiumStack>
        {sheetScreens('explore').map((name) => (
          <PremiumStackScreen key={name} name={name} options={sheetRouteOptions('fit')} />
        ))}
      </PremiumStack>
    </SessionGate>
  );
}
