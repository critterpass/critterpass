import { Row } from '../layout/Row';
import { ActionPill } from '../plan/ActionPill';

export interface PayMethod {
  readonly id: string;
  /** "Bank transfer", "PayNow", "Cash". */
  readonly label: string;
}

export interface PayMethodChipsProps {
  readonly methods: readonly PayMethod[];
  /** Methods this person accepts. */
  readonly selected: readonly string[];
  readonly onToggle: (id: string) => void;
  readonly testID?: string;
}

/** Ways people can pay you, as toggle chips (several may be on). */
export function PayMethodChips({ methods, selected, onToggle, testID }: PayMethodChipsProps) {
  return (
    <Row gap="8" wrap testID={testID}>
      {methods.map((method) => {
        const on = selected.includes(method.id);
        return (
          <ActionPill
            key={method.id}
            label={method.label}
            tone={on ? 'paper' : 'secondary'}
            accessibilityRole="checkbox"
            selected={on}
            onPress={() => onToggle(method.id)}
          />
        );
      })}
    </Row>
  );
}
