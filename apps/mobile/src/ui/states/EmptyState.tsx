import type { ReactNode } from 'react';

import { PillButton } from '../buttons/PillButton';
import { Stack } from '../layout/Stack';
import { useGuideVoiceColour, type GuideId } from '../people/GuideLine';
import { useSurfaceTone } from '../surface/Scaffold';
import { Text } from '../text/Text';

export interface EmptyStateProps {
  /** The context guide, shown sleeping or idle. */
  readonly guide: GuideId;
  readonly guideName: string;
  /** The guide's sticker in its sleeping/idle pose. */
  readonly sticker?: ReactNode;
  readonly title: string;
  /** One line in the guide's voice ("Nothing here yet. Want me to find something?"). */
  readonly line: string;
  /** The single way forward. */
  readonly action?: { readonly label: string; readonly onPress: () => void };
  readonly testID?: string;
}

const CENTRED = { textAlign: 'center' } as const;

/**
 * Never a blank list: the guide, a title, one voiced line and one primary action, all on the
 * centre line (3b-5), so a line that wraps stays under its title.
 */
export function EmptyState({
  guide,
  guideName,
  sticker,
  title,
  line,
  action,
  testID,
}: EmptyStateProps) {
  const tone = useSurfaceTone();
  const voiceColour = useGuideVoiceColour(guide);
  return (
    <Stack gap="16" align="center" padding="24" testID={testID}>
      {sticker}
      <Text variant="h3" accessibilityRole="header" style={CENTRED}>
        {title}
      </Text>
      <Text
        variant="voice"
        color={voiceColour}
        style={CENTRED}
        accessibilityLabel={`${guideName}: ${line}`}
      >
        {line}
      </Text>
      {action ? (
        <PillButton
          label={action.label}
          onPress={action.onPress}
          // On a paper or colour card the yellow pill would sit on its own colour: the ink pill reads.
          tone={tone === 'dark' ? 'yellow' : 'ink'}
        />
      ) : null}
    </Stack>
  );
}
