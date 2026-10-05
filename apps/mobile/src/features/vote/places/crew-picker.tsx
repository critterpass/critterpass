/**
 * PITCH TO THE CREW when the page was not opened from a crew: with one crew the pitch goes there
 * straight away, with several the user picks which, and with none the crew is started right here
 * (a name, one button) and the pitch carries on.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import { InlineAction } from '@/ui/buttons/InlineAction';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';

import type { CrewChoice } from '../data/use-place-save';
import { QuickCrewStart } from './quick-crew-start';

export function CrewPicker({
  crews,
  placeName,
  onPick,
}: {
  readonly crews: readonly CrewChoice[];
  readonly placeName: string;
  readonly onPick: (crewId: string) => void;
}) {
  const { t } = useLingui();
  const [starting, setStarting] = useState(false);
  if (crews.length === 0 || starting) {
    return (
      <QuickCrewStart
        placeName={placeName}
        crewIds={crews.map((crew) => crew.id)}
        onStarted={() => setStarting(true)}
        onReady={(crewId) => {
          setStarting(false);
          onPick(crewId);
        }}
        testID="crew-picker-none"
      />
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
