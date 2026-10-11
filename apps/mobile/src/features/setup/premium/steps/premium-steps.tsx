/**
 * The setup steps drawn in the premium look: the dates step and the budget step (the organiser's
 * sweet spot, a member's private max with how they sleep). Rooms and must-dos keep the current look
 * for now. Each wraps the shared step container, so reads and commands stay the same.
 */
import { useLingui } from '@lingui/react/macro';
import { useMemo, type ReactNode } from 'react';

import { Button, Card, Text, usePremiumTheme } from '@/ui/premium';

import { BudgetStep, type BudgetLook } from '../../budget/budget-step';
import type { PrivateMaxViewProps } from '../../budget/private-max-view';
import type { StepProps } from '../../shell/frame';
import type { WizardStep } from '../../shell/steps';
import { WhenStep, type WhenSheets } from '../../when/when-step';
import { PremiumCalendarConnectView } from '../calendar/connect-sheet';
import { PremiumManualDaysView } from '../calendar/manual-days-sheet';
import { PremiumWeekPicker } from '../calendar/week-picker-sheet';
import { PremiumBudgetView } from './budget-view';
import { PremiumPrivateMaxView } from './private-max-view';
import { PremiumWhenView } from './when-view';

function OwnMaxCard({ set, onChange }: { readonly set: boolean; readonly onChange: () => void }) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  return (
    <Card
      testID="budget-own-max"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.gap12,
        padding: theme.space.rowPadH,
      }}
    >
      <Text variant="rowTitle" style={{ flex: 1 }}>
        {t({ id: 'setup.budget.member.yourMax', message: 'Your max' })}
      </Text>
      <Button
        size="small"
        variant="control"
        label={
          set
            ? t({ id: 'setup.premium.max.change', message: 'Change my max' })
            : t({ id: 'setup.budget.own.add', message: 'Add yours' })
        }
        onPress={onChange}
      />
    </Card>
  );
}

function PremiumBudgetStep(props: StepProps) {
  const { tripId, me } = props.trip;
  const look = useMemo<BudgetLook>(() => {
    function PrivateMax(view: PrivateMaxViewProps) {
      return <PremiumPrivateMaxView {...view} tripId={tripId} me={me} />;
    }
    return { Budget: PremiumBudgetView, PrivateMax, OwnMax: OwnMaxCard };
  }, [tripId, me]);
  return <BudgetStep {...props} look={look} />;
}

const WHEN_SHEETS: WhenSheets = {
  Connect: PremiumCalendarConnectView,
  Manual: PremiumManualDaysView,
  Picker: PremiumWeekPicker,
};

function PremiumWhenStep(props: StepProps) {
  return <WhenStep {...props} View={PremiumWhenView} sheets={WHEN_SHEETS} />;
}

export const PREMIUM_STEP_VIEWS: Partial<Record<WizardStep, (props: StepProps) => ReactNode>> = {
  when: PremiumWhenStep,
  budget: PremiumBudgetStep,
};
