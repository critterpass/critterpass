/**
 * 2.12 "Keep it safe": a one-choice sheet over the issued pass (no Cancel or verb; tapping the dim
 * page or "Not now" skips, and saving is asked again later). Apple (iOS), Google and a phone number
 * link this pass to an account; a sign-in that already has a pass offers the switch. Saved, the
 * pass gets its SAVED mark and the page moves on. The sheet is the one the invited pass and the
 * phone page lay over themselves too.
 */
import { View } from 'react-native';

import { useBackAffordance } from '@/lib/qa/back-affordance';

import { useSaveStep } from '../../save/use-save-step';
import { PremiumIssuedView } from '../issued/PremiumIssuedPage';
import { PremiumSaveSheet } from './PremiumSaveSheet';

export function PremiumSavePage() {
  const { flow, state, focused, notNow, phone } = useSaveStep();
  // The sheet's "Not now" and the dim page above it close it: that is this page's way back.
  useBackAffordance(focused);
  return (
    <View style={{ flex: 1 }} testID="onboarding-save">
      <PremiumIssuedView choreography={false} />
      {focused ? (
        <PremiumSaveSheet
          state={state}
          onApple={() => void flow.apple()}
          onGoogle={() => void flow.google()}
          onPhone={phone}
          onNotNow={notNow}
          onUseExisting={() => void flow.confirmSwitch()}
          onKeepNew={flow.keepThisPass}
          onKeptDone={flow.closeKept}
          onReopenMerge={flow.reopenMerge}
        />
      ) : null}
    </View>
  );
}
