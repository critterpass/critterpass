import { View } from 'react-native';

import { Icon } from '../icons/Icon';
import type { PremiumIconName } from '../icons/Icon';
import { PressableScale, hitSlopFor } from '../motion/PressableScale';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import type { PremiumTheme } from '../theme/theme';

/** `white` raised on content, `ink` the dark action (send, add), `control` a light fill. */
export type IconButtonTone = 'white' | 'ink' | 'control';

export interface IconButtonProps {
  readonly icon: PremiumIconName;
  /** What the button does, read by assistive tech ("Add a stop"). */
  readonly label: string;
  readonly onPress?: () => void;
  /** @default 'white' */
  readonly tone?: IconButtonTone;
  readonly disabled?: boolean;
  /** @default 40 */
  readonly size?: number;
  readonly testID?: string;
}

function look(t: PremiumTheme, tone: IconButtonTone, disabled: boolean) {
  if (disabled)
    return { fill: t.color.iconButtonDisabled, glyph: t.color.onInk, shadow: undefined };
  if (tone === 'ink') return { fill: t.color.ink, glyph: t.color.onInk, shadow: undefined };
  if (tone === 'control') return { fill: t.color.control, glyph: t.color.ink, shadow: undefined };
  return { fill: t.color.card, glyph: t.color.ink, shadow: t.shadow.raised };
}

/** A 40 pt round icon button with a 44 pt tap target. */
export function IconButton({
  icon,
  label,
  onPress,
  tone = 'white',
  disabled = false,
  size,
  testID,
}: IconButtonProps) {
  const t = usePremiumTheme();
  const side = size ?? t.size.iconButton;
  const { fill, glyph, shadow } = look(t, tone, disabled);
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      hitSlop={hitSlopFor(side, side)}
    >
      <View
        style={{
          width: side,
          height: side,
          borderRadius: side / 2,
          backgroundColor: fill,
          alignItems: 'center',
          justifyContent: 'center',
          ...(shadow === undefined ? {} : { boxShadow: shadow }),
        }}
      >
        <Icon name={icon} size={t.size.glyph} color={glyph} />
      </View>
    </PressableScale>
  );
}
