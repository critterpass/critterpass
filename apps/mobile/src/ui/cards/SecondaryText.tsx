import { useSurfaceTone } from '../surface/Scaffold';
import type { TextProps } from '../text/Text';
import { Text } from '../text/Text';
import { useTheme } from '../theme';

/** Body copy in the surface's secondary colour (ink.200 on dark, paper.muted on paper). */
export function SecondaryText({ variant = 'bodySm', ...rest }: Omit<TextProps, 'color'>) {
  const theme = useTheme();
  const tone = useSurfaceTone();
  const color =
    tone === 'paper'
      ? theme.color.paper.muted
      : tone === 'accent'
        ? theme.semantic.text.onAccent
        : theme.semantic.text.secondary;
  return <Text variant={variant} color={color} {...rest} />;
}
