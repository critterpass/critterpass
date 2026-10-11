/**
 * The 3a-7 route: the finished pass with the save sheet over it. Saved → SAVED tick, then on to
 * the permissions page; "Use that pass" → the app starts again on the existing pass's account, at
 * Home (its session and its data, not the new pass's). Someone who already finished onboarding
 * opens this page from inside the app (the invite composer, sign out): saved or not, they go back
 * to where they opened it.
 */
import { IssuedPage } from '../issued/IssuedScreen';
import { SaveSheet } from './SaveSheet';
import { useSaveStep } from './use-save-step';

export { SAVED_ADVANCE_MS } from './use-save-step';

export function SaveScreen() {
  const { flow, state, focused, notNow, phone } = useSaveStep();
  return (
    <>
      <IssuedPage choreography={false} saved={state.kind === 'saved'} />
      {state.kind === 'saved' || !focused ? null : (
        <SaveSheet
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
      )}
    </>
  );
}
