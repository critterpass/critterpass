import { useBackAffordance } from '@/ui/qa/back-affordance';

import { Icon } from '../icons/Icon';
import type { PremiumIconName } from '../icons/Icon';
import { PressableScale } from '../motion/PressableScale';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { GlassSurface } from './GlassSurface';

export interface GlassIconButtonProps {
  readonly icon: PremiumIconName;
  /** What it does ("Back", "Share", "Close"). */
  readonly label: string;
  readonly onPress?: () => void;
  /** `clear` over photos and maps, `nav` over app content. @default 'nav' */
  readonly kind?: 'clear' | 'nav';
  readonly disabled?: boolean;
  readonly testID?: string;
}

/** The 44 pt glass circle: header back, close on full-screen covers, share and ⋯ actions. */
export function GlassIconButton({
  icon,
  label,
  onPress,
  kind = 'nav',
  disabled = false,
  testID,
}: GlassIconButtonProps) {
  const t = usePremiumTheme();
  // A glass back or ✕ is its screen's way back (the UI QA back check counts it).
  useBackAffordance(icon === 'back' || icon === 'close');
  const side = t.size.glassNav;
  const glyph = disabled
    ? t.color.placeholder
    : kind === 'clear'
      ? t.material.clear.foreground
      : t.material.nav.foreground;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
    >
      <GlassSurface
        kind={kind}
        interactive
        style={{
          width: side,
          height: side,
          borderRadius: t.radius.glassNav,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={t.size.glyph} color={glyph} />
      </GlassSurface>
    </PressableScale>
  );
}
