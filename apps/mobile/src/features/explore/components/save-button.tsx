/**
 * SAVE on a destination or a place: the label flaps to SAVED the moment it is tapped (a save
 * queued offline counts), with a toast naming what was saved.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import Animated from 'react-native-reanimated';

import { patterns } from '@/motion';
import { InlineAction } from '@/ui/buttons/InlineAction';

export interface SaveButtonProps {
  readonly saved: boolean;
  readonly onToggle: () => void;
  readonly testID?: string;
}

export function SaveButton({ saved, onToggle, testID = 'explore-save' }: SaveButtonProps) {
  const { t, i18n } = useLingui();
  const flap = patterns.useFlap({ value: saved });
  const label = flap.displayValue
    ? t({ id: 'explore.save.saved', message: '♥ Saved' })
    : t({ id: 'explore.save.save', message: '♡ Save' });
  return (
    <Animated.View style={flap.style}>
      <InlineAction
        kind="choice"
        selected={saved}
        label={upper(label, i18n.locale)}
        onPress={onToggle}
        testID={testID}
      />
    </Animated.View>
  );
}
