import type { ReactNode } from 'react';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { Card } from './Card';
import { SecondaryText } from './SecondaryText';
import type { CardTone } from './tone';

export interface CrewCardProps {
  /** "The Bali Six". */
  readonly name: string;
  /** "Bali · Oct 12–19" or "Planning". */
  readonly detail?: string;
  /** `AvatarStack` of the members. */
  readonly members?: ReactNode;
  /** Screen-reader summary of `members` ("6 members"). */
  readonly membersLabel?: string;
  /** Status chip or count badge at the end. */
  readonly status?: ReactNode;
  readonly statusLabel?: string;
  readonly tone?: CardTone;
  readonly onPress?: () => void;
  readonly testID?: string;
}

/** A crew in the crew switcher and trips list: name, trip detail, member stack, status. */
export function CrewCard({
  name,
  detail,
  members,
  membersLabel,
  status,
  statusLabel,
  tone,
  onPress,
  testID,
}: CrewCardProps) {
  const label = [name, detail, membersLabel, statusLabel].filter(Boolean).join(', ');
  return (
    <Card
      accessibilityLabel={label}
      {...(tone ? { tone } : {})}
      {...(onPress ? { onPress } : {})}
      {...(testID ? { testID } : {})}
    >
      <Row gap="12" align="center">
        <Stack gap="6" flex={1}>
          <Text variant="h3">{name}</Text>
          {detail ? <SecondaryText>{detail}</SecondaryText> : null}
          {members}
        </Stack>
        {status}
      </Row>
    </Card>
  );
}
