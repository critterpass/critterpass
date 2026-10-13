import type { PerkLine } from '../perks/perk-copy';

export interface WelcomeViewProps {
  readonly name: string;
  /** False while the server has not said Pass+ is on: the page waits rather than celebrate. */
  readonly passPlus: boolean;
  readonly celebrate: boolean;
  /** The day Pass+ was admitted, formatted for the stamp. */
  readonly admittedOn: string;
  readonly perks: readonly PerkLine[];
  /** "Yearly · renews 2 Nov 2027", or when it ends; null when there is nothing to say. */
  readonly renewal: string | null;
  /** Absent while the icon picker has no route. */
  readonly onPickIcon?: (() => void) | undefined;
  readonly onDone: () => void;
}
