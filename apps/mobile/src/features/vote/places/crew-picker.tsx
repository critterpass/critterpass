/**
 * PITCH TO THE CREW when the page was not opened from a crew: with one crew the pitch goes there
 * straight away, with several the user picks which, and with none the page says a pitch needs a
 * crew and leaves the solo trip as the way to go.
 */
import { useLingui } from '@lingui/react/macro';

import { InlineAction } from '@/ui/buttons/InlineAction';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';

import type { CrewChoice } from '../data/use-place-save';

export function CrewPicker({
  crews,
  onPick,
}: {
  readonly crews: readonly CrewChoice[];
  readonly onPick: (crewId: string) => void;
}) {
  const { t } = useLingui();
  if (crews.length === 0) {
    return (
      <Text variant="bodySm" testID="crew-picker-none">
        {t({
          id: 'vote.guest.noCrew',
          message: 'Pitching needs a crew. Start one from Crew, or take this one solo.',
        })}
      </Text>
    );
  }
  return (
    <Stack gap="8" testID="crew-picker">
      <Text variant="bodySm">
        {t({ id: 'vote.guest.whichCrew', message: 'Which crew gets the pitch?' })}
      </Text>
      <Row gap="8" wrap>
        {crews.map((crew) => (
          <InlineAction
            key={crew.id}
            kind="choice"
            label={crew.name}
            onPress={() => onPick(crew.id)}
            testID={`crew-pick-${crew.id}`}
          />
        ))}
      </Row>
    </Stack>
  );
}
