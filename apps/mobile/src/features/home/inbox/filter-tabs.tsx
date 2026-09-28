/**
 * The inbox filter (3b-4): ALL · NEEDS YOU · n · CREW · GUIDES. NEEDS YOU is where the inbox opens
 * when anything needs the user, and where it stays after the last card is handled (3b-5).
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { Segmented } from '@/ui/inputs/Segmented';

export type InboxFilter = 'all' | 'needs_you' | 'crew' | 'guides';

export interface FilterTabsProps {
  readonly value: InboxFilter;
  readonly needsYou: number;
  readonly onChange: (value: InboxFilter) => void;
}

export function FilterTabs({ value, needsYou, onChange }: FilterTabsProps) {
  const { t } = useLingui();
  const locale = useLocale();
  return (
    <Segmented<InboxFilter>
      testID="inbox-filters"
      label={t({ id: 'home.inbox.filters', message: 'Show' })}
      value={value}
      onChange={onChange}
      segments={[
        { value: 'all', label: upper(t({ id: 'home.inbox.all', message: 'All' }), locale) },
        {
          // eslint-disable-next-line lingui/no-unlocalized-strings -- a filter value, not copy.
          value: 'needs_you',
          label: upper(
            t({ id: 'home.inbox.needsYou', message: `Needs you · ${needsYou}` }),
            locale,
          ),
        },
        { value: 'crew', label: upper(t({ id: 'home.inbox.crew', message: 'Crew' }), locale) },
        {
          value: 'guides',
          label: upper(t({ id: 'home.inbox.guides', message: 'Guides' }), locale),
        },
      ]}
    />
  );
}
