/** One line of the trip receipt. */
export interface ReceiptLine {
  readonly key: string;
  readonly label: string;
  readonly amount: string;
  /** Totals print bold. */
  readonly emphasis?: boolean;
  /** Lines the scanner read (OCR), marked with the highlighter. */
  readonly highlight?: boolean;
}
