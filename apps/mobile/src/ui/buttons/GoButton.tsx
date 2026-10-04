/**
 * GO: opens the route from where you are to a place, wherever a place is the next thing to do
 * (the place page, a day plan stop, the day-of next stop). A small green pill so it sits beside a
 * stop's title without taking its row.
 */
import { useLingui } from '@lingui/react/macro';

import { PillButton } from './PillButton';

export interface GoButtonProps {
  readonly onPress: () => void;
  /** Where GO goes, when the button stands alone ("Đà Nẵng airport (DAD)"). */
  readonly detail?: string | null | undefined;
  /** Stretch to the parent's width (a card's own CTA). @default false */
  readonly block?: boolean;
  readonly testID?: string;
}

export function GoButton({ onPress, detail, block = false, testID = 'go-button' }: GoButtonProps) {
  const { t } = useLingui();
  return (
    <PillButton
      label={
        detail
          ? t({ id: 'go.button.labelTo', message: `Go · ${detail}` })
          : t({ id: 'go.button.label', message: 'Go' })
      }
      accessibilityHint={t({
        id: 'go.button.hint',
        message: 'Shows the route from where you are, then directions in your maps app',
      })}
      tone="green"
      size="sm"
      block={block}
      onPress={onPress}
      testID={testID}
    />
  );
}
