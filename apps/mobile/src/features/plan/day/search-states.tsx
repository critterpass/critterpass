/**
 * What the add sheet says under a search with no rows: still looking, the trip's places still
 * arriving on the phone (so an empty list says nothing yet), the search failing (with a retry), or
 * truly nothing found, with a way to add it in the traveller's own words. Never a silent empty space.
 */
import { useLingui } from '@lingui/react/macro';

import { PillButton } from '@/ui/buttons/PillButton';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';

export function SearchStates({
  query,
  loaded,
  failed,
  arriving,
  found,
  onRetry,
  onUseOwnWords,
}: {
  readonly query: string;
  readonly loaded: boolean;
  readonly failed: boolean;
  readonly onRetry: () => void;
  readonly arriving: boolean;
  readonly found: number;
  readonly onUseOwnWords: () => void;
}) {
  const { t } = useLingui();
  const typed = query.trim();
  if (typed === '') return null;
  if (found > 0) {
    // Rows found while the trip's places are still landing: more may come.
    return arriving ? (
      <Text variant="bodySm" testID="plan-add-more-arriving">
        {t({
          id: 'plan.day.add.moreArriving',
          message: 'More of this trip’s places are still arriving.',
        })}
      </Text>
    ) : null;
  }
  if (failed) {
    return (
      <Stack gap="8" testID="plan-add-search-failed">
        <Text variant="bodySm">
          {t({ id: 'plan.day.add.searchFailed', message: 'Couldn’t search just now.' })}
        </Text>
        <PillButton
          variant="secondary"
          label={t({ id: 'plan.day.add.tryAgain', message: 'Try again' })}
          onPress={onRetry}
          testID="plan-add-search-retry"
        />
      </Stack>
    );
  }
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
