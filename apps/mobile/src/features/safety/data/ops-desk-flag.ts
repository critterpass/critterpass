/** A `client_config` switch's text value read as on or off: off unless it says true. */
export function isOn(value: string | null | undefined): boolean {
  return value === 'true' || value === '1';
}
