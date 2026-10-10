import { Fragment } from 'react';
import { View } from 'react-native';

import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export interface WizardStepperProps {
  /** 0-based index of the step under way. */
  readonly current: number;
  readonly total: number;
  /** Spoken summary ("Step 2 of 4, dates"). */
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

/**
 * The wizard's dot line: 22 pt dots (mint done, ink current, control to do) joined by 2 pt lines
 * (ink up to the current step, grey after), in a white r20 h56 bar.
 */
export function WizardStepper({ current, total, accessibilityLabel, testID }: WizardStepperProps) {
  const t = usePremiumTheme();
  const dot = (i: number) =>
    i < current ? t.accent.mint : i === current ? t.color.ink : t.color.control;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 1, max: total, now: current + 1 }}
      style={{
        height: t.size.stepProgressBar,
        borderRadius: t.radius.banner,
        backgroundColor: t.color.card,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: t.space.rowPadH,
      }}
    >
      {Array.from({ length: Math.max(0, total) }, (_, i) => (
        <Fragment key={i}>
          {i > 0 ? (
            <View
              style={{
                flex: 1,
                height: t.size.wizardLine,
                marginHorizontal: t.space.gap6,
                backgroundColor: i <= current ? t.color.ink : t.color.stepLine,
              }}
            />
          ) : null}
          <View
            style={{
              width: t.size.wizardDot,
              height: t.size.wizardDot,
              borderRadius: t.radius.wizardDot,
              backgroundColor: dot(i),
            }}
          />
        </Fragment>
      ))}
    </View>
  );
}
