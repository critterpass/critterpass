/**
 * The one thing each checklist step lets the traveller do: GO to the facility (ride quote sheet),
 * CALL a number the step states, SHOW IT, SHARE where they are, ask the ops desk, open the ride
 * quote or the guide. A step with nothing to tap (stay put, freeze cards) has no action.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design ids and wire values; labels go through t. */
import type { ChecklistStep } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';

import type { ActionPillTone } from '@/ui/plan/ActionPill';

import type { HubModel } from './help-model';

export type StepTarget =
  | { readonly kind: 'tel'; readonly number: string }
  | { readonly kind: 'insurance' }
  | { readonly kind: 'screen'; readonly screen: string; readonly params: Record<string, string> };

export interface StepAction {
  readonly label: string;
  readonly tone: ActionPillTone;
  readonly onPress: () => void;
}

export interface StepActionDeps {
  readonly model: HubModel;
  readonly assistancePhone: string | null;
  readonly hasPolicy: boolean;
  readonly onShowPhrase: () => void;
  readonly onAskDesk: () => void;
  readonly onShare: () => void;
  readonly open: (target: StepTarget) => void;
}

const GETTING_AROUND = '3h-3';
const GUIDE_SHEET = '3j-1';

export function useStepActions(deps: StepActionDeps): (step: ChecklistStep) => StepAction | null {
  const { t } = useLingui();
  const call = (number: string): StepAction => ({
    label: t({ id: 'safety.action.call', message: 'Call' }),
    tone: 'primary',
    onPress: () => deps.open({ kind: 'tel', number }),
  });
  return (step) => {
    const facts = step.facts;
    switch (step.kind) {
      case 'nearest_facility': {
        const facility = deps.model.facilities.find((f) => f.id === facts['facility_id']);
        if (facility === undefined) return null;
        return {
          label: t({ id: 'safety.help.go', message: 'Go' }),
          tone: 'success',
          onPress: () =>
            deps.open({
              kind: 'screen',
              screen: GETTING_AROUND,
              params: { to: `${facility.lat},${facility.lng}` },
            }),
        };
      }
      case 'call_number':
      case 'police_report':
        return typeof facts['number'] === 'string' ? call(facts['number']) : null;
      case 'embassy':
        return typeof facts['phone'] === 'string' ? call(facts['phone']) : null;
      case 'phrase':
        return {
          label: t({ id: 'safety.action.showIt', message: 'Show it' }),
          tone: 'paper',
          onPress: deps.onShowPhrase,
        };
      case 'insurance_line':
        if (deps.assistancePhone !== null) return call(deps.assistancePhone);
        return deps.hasPolicy
          ? null
          : {
              label: t({ id: 'safety.action.addPolicy', message: 'Add' }),
              tone: 'outline',
              onPress: () => deps.open({ kind: 'insurance' }),
            };
      case 'ops_clinic':
        return {
          label: t({ id: 'safety.action.askDesk', message: 'Ask' }),
          tone: 'outline',
          onPress: deps.onAskDesk,
        };
      case 'share_pin':
        return {
          label: t({ id: 'safety.action.share', message: 'Share' }),
          tone: 'primary',
          onPress: deps.onShare,
        };
      case 'ride_quote':
        return {
          label: t({ id: 'safety.action.ride', message: 'Get a ride' }),
          tone: 'primary',
          onPress: () => deps.open({ kind: 'screen', screen: GETTING_AROUND, params: {} }),
        };
      case 'driver_message':
        return {
          label: t({ id: 'safety.action.guide', message: 'Ask the guide' }),
          tone: 'outline',
          onPress: () => deps.open({ kind: 'screen', screen: GUIDE_SHEET, params: {} }),
        };
      case 'freeze_cards':
      case 'stay_put':
      case 'walk_back':
        return null;
    }
  };
}
