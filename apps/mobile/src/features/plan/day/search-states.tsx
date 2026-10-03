/**
 * What the add sheet says under a search with no rows: still looking, the trip's places still
 * arriving on the phone (so an empty list says nothing yet), or truly nothing found, with a way to
 * add it in the traveller's own words. Never a silent empty space.
 */
import { useLingui } from '@lingui/react/macro';

import { PillButton } from '@/ui/buttons/PillButton';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';

export function SearchStates({
  query,
  loaded,
  arriving,
  found,
  onUseOwnWords,
}: {
  readonly query: string;
  readonly loaded: boolean;
  readonly arriving: boolean;
  readonly found: number;
  readonly onUseOwnWords: () => void;
}) {
  const { t } = useLingui();
  const typed = query.trim();
  if (typed === '' || found > 0) return null;
  if (!loaded || arriving) {
    return (
      <Text variant="bodySm" testID="plan-add-searching">
        {arriving
          ? t({
              id: 'plan.day.add.arriving',
              message: 'This trip’s places are still arriving. They show here as they land.',
            })
          : t({ id: 'plan.day.add.searching', message: 'Looking for places…' })}
      </Text>
    );
  }
  return (
    <Stack gap="8" testID="plan-add-none">
      <Text variant="bodySm">
        {t({ id: 'plan.day.add.noResults', message: `Nothing found for “${typed}”.` })}
      </Text>
      <PillButton
        variant="secondary"
        label={t({ id: 'plan.day.add.useOwnWords', message: 'Add it in your own words' })}
        onPress={onUseOwnWords}
        testID="plan-add-use-own"
      />
    </Stack>
  );
}
