/**
 * How a tool's JSON output reads to the model. Money travels in minor units (`*_minor`), which
 * models misread (150000 US cents read as 150 dollars), so every `*_minor` amount that sits beside a
 * `currency` gains a `*_amount` twin in major units ("1500.00 USD"). The model words that twin; the
 * grounding validator already accepts both readings, and the stored output is never changed.
 */

function fractionDigits(currency: string): number | undefined {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits;
  } catch {
    return undefined;
  }
}

function withAmounts(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withAmounts);
  if (node === null || typeof node !== 'object') return node;
  const entries = Object.entries(node as Record<string, unknown>);
  const currency = (node as Record<string, unknown>).currency;
  const digits = typeof currency === 'string' ? fractionDigits(currency) : undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    out[key] = withAmounts(value);
    if (digits !== undefined && key.endsWith('_minor') && typeof value === 'number') {
      const amount = (value / 10 ** digits).toFixed(digits);
      out[`${key.slice(0, -'_minor'.length)}_amount`] = `${amount} ${String(currency)}`;
    }
  }
  return out;
}

/** The tool_result text for a JSON output: the output, with major-unit amounts beside minor ones. */
export function renderToolJson(output: unknown): string {
  return JSON.stringify(withAmounts(output));
}
