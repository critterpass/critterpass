/** Who had a line: the picker's props and how one member turns on or off. */
import type { MoneyMember } from '../data/context';

export interface MemberPickerProps {
  readonly title: string;
  readonly members: readonly MoneyMember[];
  /** null = everyone. */
  readonly selected: readonly string[] | null;
  readonly onDone: (next: readonly string[] | null) => void;
  readonly onClose: () => void;
}

/** Turns one member on or off; the last one on stays on, and the order follows the crew's. */
export function toggleMember(
  all: readonly string[],
  current: readonly string[],
  id: string,
): readonly string[] {
  return current.includes(id)
    ? current.length === 1
      ? current
      : current.filter((member) => member !== id)
    : all.filter((member) => member === id || current.includes(member));
}
