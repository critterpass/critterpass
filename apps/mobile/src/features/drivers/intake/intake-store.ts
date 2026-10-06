/**
 * What was just read, held in memory between the add screen and the check screen (6c-2): the
 * shared text and the card read from it. The api keeps the same for the crew.
 */
import type { IntakeKind, ParsedIntake } from '@cp/domain';

export interface ReadIntake {
  readonly intakeId: string;
  readonly kind: IntakeKind;
  readonly text: string;
  readonly parsed: ParsedIntake | null;
  readonly sharedBy: string | null;
}

const read = new Map<string, ReadIntake>();

export const rememberIntake = (item: ReadIntake): void => {
  read.set(item.intakeId, item);
};

export const recalledIntake = (intakeId: string): ReadIntake | null => read.get(intakeId) ?? null;
