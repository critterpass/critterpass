import type { ReactNode } from 'react';

import { PillButton } from '../buttons/PillButton';
import { Stack } from '../layout/Stack';
import type { GuideId } from '../people/GuideLine';
import { GuideLine } from '../people/GuideLine';
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

/** Never a blank list: the guide, a title, one voiced line and one primary action. */
export function EmptyState({
  guide,
  guideName,
  sticker,
  title,
  line,
  action,
  testID,
}: EmptyStateProps) {
  return (
    <Stack gap="16" align="center" padding="24" testID={testID}>
      {sticker}
      <Text variant="h3" accessibilityRole="header" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      <GuideLine guide={guide} name={guideName} line={line} />
      {action ? <PillButton label={action.label} onPress={action.onPress} /> : null}
    </Stack>
  );
}
