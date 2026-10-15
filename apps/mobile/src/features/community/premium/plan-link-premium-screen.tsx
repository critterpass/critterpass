/**
 * A plan link opened in the app, premium: waits for the link's plan, then shows it as the shared
 * plan. A link that was switched off says so and leads Home; with no answer it offers another try.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import { HOME_FALLBACK } from '@/lib/navigation/back';
import { guideSticker } from '@/ui/premium/stickers/guides';
import { Button, EmptyState } from '@/ui/premium';

import { usePlanLink } from '../link/plan-link';
import {
  PlanLoading,
  PlanPagePlaceholder,
  SharedPlanPremiumScreen,
} from './shared-plan-premium-screen';

/** The guide's sticker in the empty and loading states. */
const GECKO = guideSticker(null);

export function PlanLinkPremiumScreen({ token }: { readonly token: string }) {
  const { t } = useLingui();
  const { state, retry } = usePlanLink(token);
  const home = t({ id: 'community.back.home', message: 'Home' });
  if (state.kind === 'plan') {
    return (
      <SharedPlanPremiumScreen sharedPlanId={state.sharedPlanId} tripId={null} backLabel={home} />
    );
  }
  return (
    <PlanPagePlaceholder backLabel={home} testID={`plan-link-${state.kind}`}>
      {state.kind === 'loading' ? (
        <PlanLoading />
      ) : state.kind === 'gone' ? (
        <EmptyState
          critter={GECKO}
          check={false}
          title={t({ id: 'community.link.gone', message: 'This plan is no longer shared' })}
          line={t({
            id: 'community.link.goneLine',
            message:
              'The crew took it down or switched this link off. Ask whoever sent it for a new one.',
          })}
          action={
            <Button
              label={t({ id: 'community.link.goneAction', message: 'Go to Home' })}
              variant="secondary"
              size="medium"
              onPress={() => router.navigate(HOME_FALLBACK)}
            />
          }
        />
      ) : (
        <EmptyState
          critter={GECKO}
          check={false}
          title={t({ id: 'community.detail.missing', message: 'This plan is out of reach' })}
          line={t({
            id: 'community.detail.missingLine',
            message: 'It needs a signal the first time.',
          })}
          action={
            <Button
              label={t({ id: 'community.retry', message: 'Try again' })}
              variant="secondary"
              size="medium"
              onPress={retry}
            />
          }
        />
      )}
    </PlanPagePlaceholder>
  );
}
