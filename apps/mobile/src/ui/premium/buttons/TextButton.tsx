import { createContext, useContext } from 'react';

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
  /**
   * Where the word sits in its column: at the start, or centred under a full-width button. By
   * default it starts, and centres in a footer stack (`FooterStack`).
   */
  readonly align?: TextButtonAlign;
  readonly testID?: string;
}

export type TextButtonAlign = 'start' | 'center';

const TextButtonAlignContext = createContext<TextButtonAlign>('start');

/** Sets where the text buttons inside sit by default (a footer stack centres them). */
export const TextButtonAlignProvider = TextButtonAlignContext.Provider;

/** A bare 15/600 word ("Skip", "Not now") with a 44 pt tap target. */
export function TextButton({
  label,
  onPress,
  disabled,
  tone = 'muted',
  color,
  align,
  testID,
}: TextButtonProps) {
  const t = usePremiumTheme();
  const around = useContext(TextButtonAlignContext);
  const placed = align ?? around;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={{
        minHeight: t.size.hit,
        justifyContent: 'center',
        alignSelf: placed === 'center' ? 'center' : 'flex-start',
      }}
    >
      <Text
        variant="textButton"
        numberOfLines={1}
        tone={disabled === true ? 'placeholder' : tone}
        {...(color === undefined || disabled === true ? {} : { color })}
      >
        {label}
      </Text>
    </PressableScale>
  );
}
