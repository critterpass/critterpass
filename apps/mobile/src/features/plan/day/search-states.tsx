/**
 * What the add sheet says under a search with no rows: still looking, the trip's places still
 * arriving on the phone (so an empty list says nothing yet), the search failing (with a retry), or
 * truly nothing found, with a way to add it in the traveller's own words. Never a silent empty space.
 */
import { useLingui } from '@lingui/react/macro';

import { PillButton } from '@/ui/buttons/PillButton';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';

import type { SearchState } from './server-place-search';

export function SearchStates({
  query,
  state,
  more,
  onRetry,
  onUseOwnWords,
}: {
  readonly query: string;
  readonly state: SearchState;
  /** Rows show while more places are still being searched on the server. */
  readonly more: boolean;
  readonly onRetry: () => void;
  readonly onUseOwnWords: () => void;
}) {
  const { t } = useLingui();
  const typed = query.trim();
  if (typed === '') return null;
  if (state === 'results') {
    return more ? (
      <Text variant="bodySm" testID="plan-add-searching-more">
        {t({ id: 'plan.day.add.searchingMore', message: 'Searching more places…' })}
      </Text>
    ) : null;
  }
  if (state === 'failed') {
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
  if (state === 'searching' || state === 'arriving') {
    return (
      <Text variant="bodySm" testID="plan-add-searching">
        {state === 'arriving'
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
