import { Platform } from 'react-native';

import { useBackAffordance } from '@/lib/qa/back-affordance';

import { Icon } from '../icons/Icon';
import type { PremiumIconName } from '../icons/Icon';
import { PressableScale } from '../motion/PressableScale';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { GlassSurface, NATIVE_GLASS } from './GlassSurface';

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

/**
 * The iPhone's own back and close in its bar draw their chevron about 1.75× the kit glyph and their
 * ✕ about 1.45×, so a drawn back (a crumb page) beside the system's (a plain push) looked like a
 * second style. On iOS the drawn back and ✕ take the system's size; Android keeps the design's.
 */
const IOS_NAV_GLYPH: Partial<Record<PremiumIconName, number>> = { back: 1.75, close: 1.45 };

function glyphSize(icon: PremiumIconName, base: number): number {
  const scale = Platform.OS === 'ios' ? IOS_NAV_GLYPH[icon] : undefined;
  return scale === undefined ? base : Math.round(base * scale);
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
      // Interactive Liquid Glass reacts to the touch itself; a scale on top doubles it.
      {...(NATIVE_GLASS ? { pressedScale: 1 } : {})}
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
        <Icon name={icon} size={glyphSize(icon, t.size.glyph)} color={glyph} />
      </GlassSurface>
    </PressableScale>
  );
}
