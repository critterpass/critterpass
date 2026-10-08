/**
 * The invite composer before it has a crew to invite to: the loading skeleton until the first read
 * answers, then (a crew made a moment ago, or offline, is not on the phone until it syncs) a line
 * that says so, in place of a composer whose every button is off.
 */
import { t } from '@lingui/core/macro';

import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { ScreenMissing } from '@/ui/states/ScreenMissing';

import { CREW_ROUTES } from '../crews-sheet/routes';

export function ComposerUnavailable({ loaded }: { readonly loaded: boolean }) {
  const backLabel = t({ id: 'crew.composer.back', message: 'Back' });
  if (!loaded) {
    return (
      <ScreenLoading
        backLabel={backLabel}
        fallback={CREW_ROUTES.home}
        testID="invite-composer-loading"
      />
    );
  }
  return (
    <ScreenMissing
      backLabel={backLabel}
      fallback={CREW_ROUTES.home}
      line={t({
        id: 'crew.composer.notSynced',
        message: 'This crew isn’t on your phone yet. Invite friends once it syncs.',
      })}
      testID="invite-composer-missing"
    />
  );
}
