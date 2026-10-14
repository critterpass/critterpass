/**
 * One title per page: a page that sets its own large title in its body (34/800, "Drivers our crews
 * used") tells the push screen around it, which then shows only the back and the page it returns
 * to in its bar, never the same title a second time inline (the design's crumb and large title).
 * The premium `Text` reports its `largeTitle` variant; nothing else opts in.
 */
import { createContext, useContext, useEffect } from 'react';

/** Counts the large titles shown in a push screen's body (+1 shown, −1 gone). */
export const BodyTitleContext = createContext<((change: 1 | -1) => void) | null>(null);

export function useReportBodyTitle(active: boolean): void {
  const report = useContext(BodyTitleContext);
  useEffect(() => {
    if (!active || report === null) return undefined;
    report(1);
    return () => report(-1);
  }, [active, report]);
}
