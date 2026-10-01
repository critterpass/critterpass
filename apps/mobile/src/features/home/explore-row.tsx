/**
 * Home's way into Explore (destination guides, saved places, offline maps), in the dashed row
 * style. The row is there only once the Explore area has registered its front page: a row that
 * opens nothing is never shown.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import { useLocale } from '@/lib/i18n/use-locale';
import { useScreenHref } from '@/lib/navigation/screen-registry';
import { Icon } from '@/ui/icons/Icon';

import { DashedRow } from './dashed-row';
import { EXPLORE_SCREEN } from './routes';

export function ExploreRow() {
  const { t } = useLingui();
  const locale = useLocale();
  const href = useScreenHref(EXPLORE_SCREEN);
  if (href === undefined) return null;
  return (
    <DashedRow
      testID="home-explore"
      title={upper(t({ id: 'home.explore.title', message: 'Explore' }), locale)}
      body={t({
        id: 'home.explore.body',
        message: 'Guides, saved places and offline maps',
      })}
      mark={<Icon name="pin" size={20} />}
      onPress={() => router.push(href)}
    />
  );
}
