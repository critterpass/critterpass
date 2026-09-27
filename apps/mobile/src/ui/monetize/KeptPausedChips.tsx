import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Tag } from '../plan/ActionPill';
import { Text } from '../text/Text';
import { useTheme } from '../theme';

export interface KeptPausedChipsProps {
  /** "Kept for good". */
  readonly keptLabel: string;
  readonly kept: readonly string[];
  /** "Pauses Oct 26". */
  readonly pausedLabel: string;
  readonly paused: readonly string[];
  readonly testID?: string;
}

/** What stays forever vs what pauses when a boost ends, as two labelled chip groups. */
export function KeptPausedChips({
  keptLabel,
  kept,
  pausedLabel,
  paused,
  testID,
}: KeptPausedChipsProps) {
  const theme = useTheme();
  return (
    <Stack gap="14" testID={testID}>
      <Stack
        gap="8"
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${keptLabel}: ${kept.join(', ')}`}
      >
        <Text variant="eyebrow" color={theme.semantic.state.success}>
          {keptLabel}
        </Text>
        <Row gap="6" wrap>
          {kept.map((item) => (
            <Tag key={item} label={item} color={theme.semantic.state.success} />
          ))}
        </Row>
      </Stack>
      <Stack
        gap="8"
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${pausedLabel}: ${paused.join(', ')}`}
      >
        <Text variant="eyebrow">{pausedLabel}</Text>
        <Row gap="6" wrap style={{ opacity: 0.6 }}>
          {paused.map((item) => (
            <Tag key={item} label={item} />
          ))}
        </Row>
      </Stack>
    </Stack>
  );
}
