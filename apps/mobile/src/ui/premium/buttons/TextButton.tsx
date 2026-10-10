import { PressableScale } from '../motion/PressableScale';
import { Text } from '../text/Text';
import type { PremiumTextTone } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export interface TextButtonProps {
  readonly label: string;
  readonly onPress?: () => void;
  readonly disabled?: boolean;
  /** @default 'muted' */
  readonly tone?: PremiumTextTone;
  /** A colour that is not a named tone (a banner's action word). */
  readonly color?: string;
  readonly testID?: string;
}

/** A bare 15/600 word ("Skip", "Not now") with a 44 pt tap target. */
export function TextButton({
  label,
  onPress,
  disabled,
  tone = 'muted',
  color,
  testID,
}: TextButtonProps) {
  const t = usePremiumTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={{ minHeight: t.size.hit, justifyContent: 'center', alignSelf: 'flex-start' }}
    >
      <Text
        variant="textButton"
        tone={disabled === true ? 'placeholder' : tone}
        {...(color === undefined || disabled === true ? {} : { color })}
      >
        {label}
      </Text>
    </PressableScale>
  );
}
