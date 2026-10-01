/**
 * Home's way into Explore (destination guides, saved places, offline maps), in the dashed row
 * style. The row opens the Explore front page once that area registers it.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import { useLocale } from '@/lib/i18n/use-locale';
import { Icon } from '@/ui/icons/Icon';

import { DashedRow } from './dashed-row';
import { homeRoutes } from './routes';

export function ExploreRow() {
  const { t } = useLingui();
  const locale = useLocale();
  const open = () => {
    const href = homeRoutes.explore();
    if (href !== undefined) router.push(href);
  };
  return (
    <DashedRow
      testID="home-explore"
      title={upper(t({ id: 'home.explore.title', message: 'Explore' }), locale)}
      body={t({
        id: 'home.explore.body',
        message: 'Guides, saved places and offline maps',
      })}
      mark={<Icon name="pin" size={20} />}
      onPress={open}
    />
  );
}
