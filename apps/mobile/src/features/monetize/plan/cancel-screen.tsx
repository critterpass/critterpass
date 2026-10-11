/** Before you go (4d-2) on the current UI. */
import { useLingui } from '@lingui/react/macro';

import { ScreenLoading } from '@/ui/states/ScreenLoading';

import { MONETIZE_ROUTES } from '../routes';
import { CancelView } from './cancel-view';
import { useCancelScreen } from './use-cancel-screen';

export function CancelScreen() {
  const { t } = useLingui();
  const props = useCancelScreen();
  if (props === null) {
    return (
      <ScreenLoading
        backLabel={t({ id: 'monetize.back.plan', message: 'Your plan' })}
        fallback={MONETIZE_ROUTES.plan}
        testID="cancel-loading"
      />
    );
  }
  return <CancelView {...props} />;
}
