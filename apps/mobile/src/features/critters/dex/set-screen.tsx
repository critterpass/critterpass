/** A place set's page (3l-8) over synced rows: only that set's rows are read. */
import { upper } from '@cp/i18n';
import { router } from 'expo-router';

import { useLocale } from '@/lib/i18n/use-locale';
import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { ScreenMissing } from '@/ui/states/ScreenMissing';

import { critterRoute, PASS_TAB, whereRoute } from '../routes';
import { backToDex, loadingSet } from './dex-copy';
import { SetView } from './set-view';
import { useSet } from './use-dex';

export function SetScreen({ setId }: { readonly setId: string }) {
  const locale = useLocale();
  const { loaded, set } = useSet(setId);
  const backLabel = upper(backToDex(), locale);
  if (set === null) {
    return loaded ? (
      <ScreenMissing backLabel={backLabel} fallback={PASS_TAB} testID="critters-set-missing" />
    ) : (
      <ScreenLoading
        backLabel={backLabel}
        fallback={PASS_TAB}
        label={loadingSet()}
        testID="critters-set-loading"
      />
    );
  }
  return (
    <SetView
      set={set}
      onOpenCritter={(id) => router.push(critterRoute(id))}
      onOpenWhere={(formId) => router.push(whereRoute(formId))}
    />
  );
}
