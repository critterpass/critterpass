/**
 * The trailer's slides in the order a traveller will live them: slides about a stop are set day by
 * day, earlier first, in the places those slides already hold, so the guide's opening and closing
 * slides (about no stop) stay where it put them.
 */
import { inPlanOrder, type StopTime } from '../data/picks';
import type { Slide } from '../data/proposal';

export function slidesInPlanOrder(
  slides: readonly Slide[],
  stops: ReadonlyMap<string, StopTime>,
): Slide[] {
  const timed = slides.flatMap((slide) => {
    const stop = slide.item_id === null ? undefined : stops.get(slide.item_id);
    return stop === undefined ? [] : [{ slide, dayNo: stop.dayNo, startsAt: stop.startsAt }];
  });
  const ordered = inPlanOrder(timed);
  let next = 0;
  return slides.map((slide) => {
    const known = slide.item_id !== null && stops.has(slide.item_id);
    return known ? (ordered[next++]?.slide ?? slide) : slide;
  });
}
