/** Stops, meals included, that fit a stretch of the day: a visit and the ride to it take about two hours. */
export function stopBudget(minutes: number): number {
  return Math.max(1, Math.min(7, Math.floor(minutes / 110)));
}
