export interface SeatCapViewProps {
  readonly destination: string;
  readonly cap: number;
  /** Who is seated, in join order. */
  readonly seats: ReadonlyArray<{ readonly uid: string; readonly name: string }>;
  /** The invited person's name; null when the invite names nobody. */
  readonly invitee: string | null;
  /** The store's price for a trip boost; null while the store has none to show. */
  readonly price: string | null;
  /** Each share if the crew, the invitee included, split it; null when unknown. */
  readonly each: string | null;
  /** How many would share it (the seated crew and the invitee). */
  readonly ways: number;
  readonly onBoost: () => void;
  readonly onKeep: () => void;
  readonly onDismiss: () => void;
}
