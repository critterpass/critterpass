/**
 * The place page's main action. In a trip it is ADD TO DAY at the slot the planner suggests (a
 * member's reads SUGGEST, since the crew okays it), and turns green with the day once the place is
 * in the plan or on its way to the crew. With no trip it saves the place instead.
 */
import { useLingui } from '@lingui/react/macro';

import { PillButton } from '@/ui/buttons/PillButton';

import type { AddState } from '../place-model';

export type AddToDayButtonProps =
  | {
      readonly kind: 'trip';
      readonly state: AddState;
      /** The add went to the crew as a suggestion. */
      readonly proposed: boolean;
      /** The trip's context is still loading, or the add is on its way. */
      readonly busy: boolean;
      /** No connection and nothing to suggest a slot from. */
      readonly offline: boolean;
      readonly onAdd: () => void;
      /** Opens the plan; absent while that screen is not in the app. */
      readonly onOpenPlan?: (() => void) | undefined;
    }
  | { readonly kind: 'save'; readonly saved: boolean; readonly onToggleSave: () => void };

const noop = () => undefined;

export function AddToDayButton(props: AddToDayButtonProps) {
  const { t } = useLingui();
  if (props.kind === 'save') {
    return (
      <PillButton
        label={
          props.saved
            ? t({ id: 'explore.add.saved', message: 'Saved' })
            : t({ id: 'explore.add.save', message: 'Save for a trip' })
        }
        tone={props.saved ? 'green' : 'yellow'}
        flap
        onPress={props.onToggleSave}
        testID="explore-place-save-cta"
      />
    );
  }
  const { state } = props;
  if (state.kind === 'planned') {
    const day = state.dayNo;
    return (
      <PillButton
        label={
          props.proposed
            ? t({ id: 'explore.add.suggested', message: `Suggested for day ${day}` })
            : t({ id: 'explore.add.inDay', message: `In day ${day}` })
        }
        tone="green"
        flap
        onPress={props.onOpenPlan ?? noop}
        testID="explore-place-in-plan"
      />
    );
  }
  if (state.kind === 'add') {
    const { dayNo: day, time } = state;
    return (
      <PillButton
        label={
          state.mode === 'apply'
            ? t({ id: 'explore.add.toDay', message: `Add to day ${day} · ${time}` })
            : t({ id: 'explore.add.suggest', message: `Suggest for day ${day} · ${time}` })
        }
        flap
        loading={props.busy}
        onPress={props.onAdd}
        testID="explore-place-add"
      />
    );
  }
  return (
    <PillButton
      label={
        state.kind === 'full'
          ? t({ id: 'explore.add.full', message: 'No free slot in the plan' })
          : props.offline
            ? t({ id: 'explore.add.offline', message: 'Adding needs a connection' })
            : t({ id: 'explore.add.noPlan', message: 'No plan to add to yet' })
      }
      variant="secondary"
      loading={props.busy}
      disabled
      onPress={noop}
      testID="explore-place-add-off"
    />
  );
}
