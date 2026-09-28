/**
 * Minor-unit amounts shown and edited in major units of their currency (USD 12000 → "$120").
 */
function fractionDigits(currency: string): number {
  return (
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

export function formatMinor(minor: number, currency: string): string {
  const digits = fractionDigits(currency);
  const whole = minor % 10 ** digits === 0;
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(minor / 10 ** digits);
}

/** The editable text for an amount: major units without grouping ("120", "12.5"). */
export function minorToInput(minor: number, currency: string): string {
  return String(minor / 10 ** fractionDigits(currency));
}

/** Parses a typed major-unit amount into minor units; `undefined` when it is not one. */
export function inputToMinor(text: string, currency: string): number | undefined {
  const digits = fractionDigits(currency);
  const trimmed = text.trim();
  const pattern = digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`);
  if (!pattern.test(trimmed)) return undefined;
  const value = Math.round(Number(trimmed) * 10 ** digits);
  return Number.isSafeInteger(value) ? value : undefined;
}
