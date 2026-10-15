export interface DetailDoc {
  readonly id: string;
  readonly label: string;
  /** Local file on the phone, null until the offline bundle saved it. */
  readonly uri: string | null;
}
