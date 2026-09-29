import { Stack } from '../layout/Stack';
import { useSurfaceTone } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { useTheme } from '../theme';
import { paperColours } from './paper-colours';

export interface DocFieldProps {
  /** Printed label, bilingual on passports ("Given name · Prénom"). */
  readonly label: string;
  readonly value: string;
  readonly flex?: number;
  /** Let a long value wrap onto more lines instead of cutting it (a ticket's narrow fields). */
  readonly wrap?: boolean;
}

/** A labelled field printed on a document or ticket: small mono label over a bold value. */
export function DocField({ label, value, flex, wrap = false }: DocFieldProps) {
  const theme = useTheme();
  const tone = useSurfaceTone();
  const labelColour =
    tone === 'paper'
      ? paperColours(theme).label
      : tone === 'accent'
        ? theme.semantic.text.onAccent
        : theme.semantic.text.secondary;
  return (
    <Stack gap="2" {...(flex !== undefined ? { flex } : {})}>
      <Text variant="monoData" color={labelColour}>
        {label}
      </Text>
      <Text variant="title" numberOfLines={wrap ? undefined : 1}>
        {value}
      </Text>
    </Stack>
  );
}
