/**
 * Waiting on real timers for work that finishes off the render path: live queries on the local
 * database, the command queue, entrance motion. Those updates land between a test's steps, where
 * no `act` scope can hold them, so while a harness only waits React is told that updates may
 * arrive on their own (what the testing library's `waitFor` does); once the wait is over, an
 * update outside `act` is reported again.
 */
interface ActScope {
  IS_REACT_ACT_ENVIRONMENT?: boolean | undefined;
}

/** Runs `wait` with React accepting updates that land outside `act`. */
export async function outsideAct<T>(wait: () => Promise<T>): Promise<T> {
  const scope = globalThis as ActScope;
  const previous = scope.IS_REACT_ACT_ENVIRONMENT;
  scope.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    return await wait();
  } finally {
    scope.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}

/** Lets `ms` of real time pass, with whatever settles in it. */
export function pause(ms: number): Promise<void> {
  return outsideAct(() => new Promise((resolve) => setTimeout(resolve, ms)));
}
