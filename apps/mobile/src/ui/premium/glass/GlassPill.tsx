import { View } from 'react-native';

import { Icon } from '../icons/Icon';
import type { PremiumIconName } from '../icons/Icon';
import { PressableScale } from '../motion/PressableScale';
import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { GlassSurface } from './GlassSurface';

export interface GlassPillProps {
  readonly label: string;
  /** A second line under the label: the centred title pill over photos ("Uluwatu · Day 3"). */
  readonly subtitle?: string;
  readonly icon?: PremiumIconName;
  /** Without it the pill is a title, not a button. */
  readonly onPress?: () => void;
  /** `clear` over photos and maps, `nav` over app content. @default 'nav' */
  readonly kind?: 'clear' | 'nav';
  readonly testID?: string;
}

/**
 * The 44-high labelled glass pill: a header's right action ("Map") or, with a subtitle, the centred
 * title between a glass back circle and a glass icon group over a photo.
 */
export function GlassPill({
  label,
  subtitle,
  icon,
  onPress,
  kind = 'nav',
  testID,
}: GlassPillProps) {
  const t = usePremiumTheme();
  const fg = t.material[kind].foreground;
  const secondary = kind === 'clear' ? fg : t.color.inkSecondary;

  const body = (
    <GlassSurface
      kind={kind}
      interactive={onPress !== undefined}
      style={{
        height: t.size.glassPill,
        borderRadius: t.radius.glassNav,
        paddingHorizontal: t.space.pillPadH,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: t.space.gap6,
      }}
    >
      {icon === undefined ? null : <Icon name={icon} size={t.size.glyph} color={fg} />}
      <View style={{ alignItems: 'center' }}>
        <Text variant="glassTitle" color={fg} numberOfLines={1}>
          {label}
        </Text>
        {subtitle === undefined ? null : (
          <Text variant="glassSubtitle" color={secondary} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
    </GlassSurface>
  );

  if (onPress === undefined) {
    return (
      <View
        testID={testID}
        accessible
        accessibilityRole="header"
        accessibilityLabel={subtitle === undefined ? label : `${label}, ${subtitle}`}
      >
        {body}
      </View>
    );
  }
  return (
    <PressableScale testID={testID} onPress={onPress} accessibilityLabel={label}>
      {body}
    </PressableScale>
  );
}
