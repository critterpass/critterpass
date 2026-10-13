export interface StampedViewProps {
  /** The server's boost row for this trip is on. */
  readonly boosted: boolean;
  readonly destination: string;
  readonly crew: string;
  /** The boost's window, formatted; empty while unknown. */
  readonly window: string;
  /** The cost was split: every share is an entry in Balances. */
  readonly split: boolean;
  /** The crewmates whose share is written, in the order their rows arrived. */
  readonly owing?: ReadonlyArray<{ readonly uid: string; readonly name: string }>;
  /** Each crewmate's share, formatted; null until the shares are written. */
  readonly eachShare?: string | null;
  /** TELL THE CREW: posts the boost's card to the crew chat. Absent for a boost with no crew to tell. */
  readonly onTell?: () => void;
  /** The card is already in the crew chat. */
  readonly told?: boolean;
  readonly telling?: boolean;
  readonly onDone: () => void;
}
