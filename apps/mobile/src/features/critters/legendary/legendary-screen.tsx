/**
 * The legendary calendar (3l-9) over synced rows: every legendary window, my finds, and REMIND ME,
 * which turns reminders on for every one still to find (`set_legendary_reminder`, offline too).
 */
import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion';
import { ScreenLoading } from '@/ui/states/ScreenLoading';

import { backToDex } from '../dex/dex-copy';
import { PASS_TAB } from '../routes';
import { remindersSet } from './legendary-copy';
import { LegendaryView } from './legendary-view';
import { useLegendaryCalendar } from './use-legendary-calendar';

export function LegendaryScreen({ now = () => new Date() }: { readonly now?: () => Date }) {
  const locale = useLocale();
  const calendar = useLegendaryCalendar(now);
  if (!calendar.loaded) {
    return (
      <ScreenLoading
        backLabel={upper(backToDex(), locale)}
        fallback={PASS_TAB}
        testID="critters-legendaries-loading"
      />
    );
  }

  const onRemind = () => {
    const turnedOn = calendar.toggleAll();
    if (turnedOn > 0) {
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast de-dupe key, never copy.
      toast.show({ id: `critters-remind-${turnedOn}`, title: remindersSet(turnedOn) });
    }
  };

  return (
    <LegendaryView
      items={calendar.items}
      months={calendar.months}
      allReminded={calendar.allReminded}
      notificationsOff={calendar.notificationsOff}
      onRemind={onRemind}
    />
  );
}
