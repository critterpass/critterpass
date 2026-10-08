/**
 * A question handed back to the guide sheet by a screen opened from it (the menu camera's "Least
 * spicy?"): it lands in the composer of the sheet that is open underneath, in the mode that sheet
 * is on, for the person to send. No second sheet is opened over the first.
 */
import { useEffect } from 'react';

type Take = (question: string) => void;

/** The open sheets, the one on top last. */
const sheets: Take[] = [];

/** Gives the question to the sheet on top; false when no sheet is open to take it. */
export function handToSheet(question: string): boolean {
  const take = sheets[sheets.length - 1];
  if (take === undefined) return false;
  take(question);
  return true;
}

/** The sheet's side: `take` gets each question handed to it while it is open. */
export function useHandedQuestion(take: Take): void {
  useEffect(() => {
    sheets.push(take);
    return () => {
      const at = sheets.lastIndexOf(take);
      if (at >= 0) sheets.splice(at, 1);
    };
  }, [take]);
}
