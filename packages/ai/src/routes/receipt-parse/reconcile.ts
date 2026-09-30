/**
 * Reconciling the validated lines with the printed total. The model's usual slips on photographed
 * receipts leave the lines off the total by a known shape: a unit price listed as its own charge or
 * taken over the line total, a discount summary listed instead of the line discounts, tax that is
 * already inside the prices listed as a charge, or a price read from the wrong column. When the
 * lines miss the total, code tries the smallest set of such corrections that makes them add up
 * exactly, and keeps it only when it is the one answer; every amount it uses is re-read from a
 * printed OCR line, never from the model. What cannot be reconciled is left as is and its doubtful
 * lines are named for the person reviewing the receipt.
 */
import type { OcrLine } from './schema';

export interface ReconcileLine {
  readonly line_id: string;
  readonly label: string;
  readonly qty: number | null;
  readonly amount_minor: number;
  readonly kind: 'item' | 'service' | 'tax' | 'discount' | 'tip';
}

export interface ReconcileInput<Line extends ReconcileLine> {
  readonly lines: readonly Line[];
  readonly ocrLines: readonly OcrLine[];
  readonly total: number | null;
  /** OCR lines an answer (a charge, the total or a rejected charge) already cites. */
  readonly claimed: ReadonlySet<string>;
  /** Parses a whole OCR line that prints only an amount, or `null`. */
  readonly priceOf: (line: OcrLine) => number | null;
  /** The largest gap (minor units) cash rounding leaves between the lines and the total. */
  readonly tolerance: number;
}

export interface Reconciled<Line extends ReconcileLine> {
  readonly lines: Line[];
  /** Lines to check by hand: the ones a correction could apply to, when none adds up alone. */
  readonly review_line_ids: string[];
}

/** How far (in OCR lines) a correction may look from the line it corrects. */
const REACH = 3;
/** The most corrections tried together; more would fit a total by chance. */
const MAX_EDITS = 3;
/** Combinations tried before giving up on a receipt as too loose to reconcile. */
const SEARCH_BUDGET = 200_000;

interface Edit {
  /** Index into the lines. */
  readonly index: number;
  /** Change to the lines' sum. */
  readonly delta: number;
  /** The OCR line the new amount is read from, when the edit reads one. */
  readonly takes: string | null;
  /** The new amount, or `null` to drop the line. */
  readonly amount: number | null;
  /** The line beside it prints a different amount for the same charge. */
  readonly adjacent: boolean;
}

const signed = (line: ReconcileLine) =>
  line.kind === 'discount' ? -line.amount_minor : line.amount_minor;

export const linesSum = (lines: readonly ReconcileLine[]) =>
  lines.reduce((sum, line) => sum + signed(line), 0);

/** A negative amount printed alone on a line ("-16.34"): a line discount. */
const isNegative = (text: string) => /^\s*[-−]/u.test(text);

/**
 * A discount the model answered as one summary ("Summary of discounts -36.14") when the receipt
 * prints each line discount on its own: the summary becomes those lines when two or more unclaimed
 * negative amounts add up to it exactly. The sum is unchanged, only the detail is kept.
 */
function splitDiscountSummaries<Line extends ReconcileLine>(
  input: ReconcileInput<Line>,
  lines: Line[],
  claimed: Set<string>,
): Line[] {
  const negatives = input.ocrLines
    .filter((line) => !claimed.has(line.id) && isNegative(line.text))
    .map((line) => ({ line, amount: -(input.priceOf(line) ?? 0) }))
    .filter((entry) => entry.amount > 0)
    .slice(0, 12);
  if (negatives.length < 2) return lines;
  return lines.flatMap((line) => {
    if (line.kind !== 'discount') return [line];
    const parts = subsetSumming(negatives, line.amount_minor);
    if (parts === null || parts.some((part) => claimed.has(part.line.id))) return [line];
    for (const part of parts) claimed.add(part.line.id);
    return parts.map((part) => ({ ...line, line_id: part.line.id, amount_minor: part.amount }));
  });
}

/** The only subset of two or more entries summing to `target`, or `null` (none or several). */
function subsetSumming<T extends { readonly amount: number }>(
  entries: readonly T[],
  target: number,
): T[] | null {
  let found: T[] | null = null;
  for (let mask = 1; mask < 1 << entries.length; mask += 1) {
    const picked = entries.filter((_, bit) => (mask & (1 << bit)) !== 0);
    if (picked.length < 2) continue;
    if (picked.reduce((sum, entry) => sum + entry.amount, 0) !== target) continue;
    if (found !== null) return null;
    found = picked;
  }
  return found;
}

function candidateEdits<Line extends ReconcileLine>(
  input: ReconcileInput<Line>,
  lines: readonly Line[],
  claimed: ReadonlySet<string>,
): Edit[] {
  const at = new Map(input.ocrLines.map((line, index) => [line.id, index]));
  const near = (a: string, b: string) =>
    Math.abs((at.get(a) ?? -Infinity) - (at.get(b) ?? Infinity)) <= REACH;
  const edits: Edit[] = [];
  lines.forEach((line, index) => {
    const drop = { index, delta: -signed(line), takes: null, amount: null, adjacent: false };
    if (line.kind === 'item') {
      // A unit price listed beside its line total, or a free dish echoed by its promotion.
      const echoed = lines.some(
        (other, j) =>
          j !== index &&
          ((other.kind === 'item' &&
            near(line.line_id, other.line_id) &&
            other.amount_minor % line.amount_minor === 0) ||
            (other.kind === 'discount' && other.amount_minor === line.amount_minor)),
      );
      if (echoed) edits.push(drop);
    } else {
      // Tax or service already inside the prices, or a discount summary over line discounts.
      edits.push(drop);
    }
    // The amount another column prints for the same line: the line total over a unit price, or
    // the column the recogniser read cleanly.
    const from = at.get(line.line_id);
    if (from === undefined) return;
    for (let step = -REACH; step <= REACH; step += 1) {
      const other = input.ocrLines[from + step];
      if (step === 0 || other === undefined || claimed.has(other.id)) continue;
      const amount = input.priceOf(other);
      if (amount === null || amount <= 0 || amount === line.amount_minor) continue;
      const sign = line.kind === 'discount' ? -1 : 1;
      edits.push({
        index,
        delta: sign * (amount - line.amount_minor),
        takes: other.id,
        amount,
        adjacent: Math.abs(step) === 1,
      });
    }
  });
  return edits;
}

/** Every smallest set of edits (one per line, one per OCR line) whose deltas close the gap. */
function smallestFits(edits: readonly Edit[], gap: number, tolerance: number): Edit[][] {
  let budget = SEARCH_BUDGET;
  for (let size = 1; size <= MAX_EDITS; size += 1) {
    const fits: Edit[][] = [];
    const walk = (start: number, picked: Edit[], sum: number) => {
      if (budget-- <= 0) return;
      if (picked.length === size) {
        if (Math.abs(sum + gap) <= tolerance) fits.push([...picked]);
        return;
      }
      for (const [i, edit] of edits.entries()) {
        if (i < start) continue;
        if (picked.some((p) => p.index === edit.index)) continue;
        if (edit.takes !== null && picked.some((p) => p.takes === edit.takes)) continue;
        picked.push(edit);
        walk(i + 1, picked, sum + edit.delta);
        picked.pop();
      }
    };
    walk(0, [], 0);
    if (budget <= 0) return [];
    if (fits.length > 0) return fits;
  }
  return [];
}

function applyEdits<Line extends ReconcileLine>(lines: readonly Line[], edits: readonly Edit[]) {
  const byIndex = new Map(edits.map((edit) => [edit.index, edit]));
  return lines.flatMap((line, index) => {
    const edit = byIndex.get(index);
    if (edit === undefined) return [line];
    if (edit.amount === null || edit.takes === null) return [];
    return [{ ...line, line_id: edit.takes, amount_minor: edit.amount }];
  });
}

const signature = (lines: readonly ReconcileLine[]) =>
  lines
    .map((line) => `${line.kind}:${line.amount_minor}`)
    .sort()
    .join('|');

export function reconcileWithTotal<Line extends ReconcileLine>(
  input: ReconcileInput<Line>,
): Reconciled<Line> {
  const claimed = new Set([...input.claimed, ...input.lines.map((line) => line.line_id)]);
  const lines = splitDiscountSummaries(input, [...input.lines], claimed);
  if (input.total === null) return { lines, review_line_ids: [] };
  const gap = linesSum(lines) - input.total;
  if (Math.abs(gap) <= input.tolerance) return { lines, review_line_ids: [] };
  const edits = candidateEdits(input, lines, claimed);
  // Leaving out a line the model should not have listed is tried before reading another column:
  // a subtotal printed near an item must not stand in for it when the tax line is the slip.
  const drops = edits.filter((edit) => edit.amount === null);
  const dropFits = smallestFits(drops, gap, input.tolerance);
  const fits = dropFits.length > 0 ? dropFits : smallestFits(edits, gap, input.tolerance);
  const results = fits.map((fit) => applyEdits(lines, fit));
  // Fits that differ only in which of two equal lines they touch are one answer; the later line
  // is the likelier echo (a promotion row prints under the dish it frees).
  const last = results.at(-1);
  if (last !== undefined && results.every((r) => signature(r) === signature(last))) {
    return { lines: last, review_line_ids: [] };
  }
  // Several fits: the lines they touch. None: the lines whose neighbour prints another amount.
  const doubtful = new Set(
    (fits.length > 0 ? fits.flat() : edits.filter((edit) => edit.adjacent)).map(
      (edit) => lines[edit.index]?.line_id,
    ),
  );
  return { lines, review_line_ids: lines.map((l) => l.line_id).filter((id) => doubtful.has(id)) };
}
