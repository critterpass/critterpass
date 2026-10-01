/**
 * Picking the stay before the rooms exist (undesigned; from the radio-card pattern): each stay
 * type the destination's cost index lists, with its nightly range per room as an estimate (there
 * is no live price before booking), and the guide splits the rooms once one is picked.
 */
import { t } from '@lingui/core/macro';

import { RadioCard } from '@/ui/inputs/RadioCard';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { stayName } from './copy';

export interface StayOption {
  readonly type: string;
  /** "₫180,000–₫470,000" per room per night, already formatted. */
  readonly text: string;
  /** The currency the figures are quoted in when they could not be put in the crew's own. */
  readonly quotedIn?: string | null;
}

export function StayPicker({
  stays,
  onPick,
}: {
  readonly stays: readonly StayOption[];
  readonly onPick: (type: string) => void;
}) {
  const theme = useTheme();
  if (stays.length === 0) {
    return (
      <Text variant="body" color={theme.semantic.text.secondary} testID="setup-rooms-no-stays">
        {t({
          id: 'setup.rooms.noStays',
          message: 'No stay prices for this place yet. The rooms split evenly for now.',
        })}
      </Text>
    );
  }
  return (
    <Stack gap="10" testID="setup-rooms-stays">
      {stays.map((stay) => {
        const estimate = stay.text;
        const code = stay.quotedIn ?? null;
        return (
          <RadioCard
            key={stay.type}
            title={stayName(stay.type)}
            description={
              code === null
                ? t({
                    id: 'setup.rooms.estimate',
                    message: `About ${estimate} a room a night, estimate`,
                  })
                : t({
                    id: 'setup.rooms.estimateQuoted',
                    message: `About ${estimate} a room a night, estimate in ${code}`,
                  })
            }
            selected={false}
            onSelect={() => onPick(stay.type)}
            testID={`setup-rooms-stay-option-${stay.type}`}
          />
        );
      })}
    </Stack>
  );
}
