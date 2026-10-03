/**
 * A fit warning under the add sheet's times ("57 min short to get here from Cầu Rồng, …"): the
 * whole sentence matters, so it wraps over as many lines as it needs instead of being cut.
 */
import { InfoPill } from '@/ui/chips/InfoPill';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

export function FitWarningPill({ children }: { readonly children: string }) {
  const theme = useTheme();
  return (
    <InfoPill icon="flame" accessibilityLabel={children}>
      <Text
        variant="label"
        color={theme.semantic.text.primary}
        singleLine={false}
        style={{ flexShrink: 1 }}
      >
        {children}
      </Text>
    </InfoPill>
  );
}
