/**
 * Stickers waiting to be drawn, drawn one per macrotask so a screen of new stickers (a Critterdex
 * grid) never holds the JS thread for more than one sticker's draw at a time. Stickers on screen
 * go first, then the nearest below the fold; a sticker that unmounts before its turn leaves the
 * queue, and once nothing waits no task stays scheduled.
 */

export interface DrawJob<T> {
  readonly key: string;
  readonly draw: () => T;
}

interface Pending<T> {
  readonly draw: () => T;
  readonly waiters: Map<number, Waiter<T>>;
  /** Lower draws sooner: 0 on screen, then distance below it. */
  priority: number;
  readonly order: number;
}

interface Waiter<T> {
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

export interface DrawRequest<T> {
  readonly result: Promise<T>;
  /** The sticker's place moved (it came on screen, or scrolled away). */
  readonly prioritise: (priority: number) => void;
  /** The sticker unmounted: if nobody else waits for this picture, it is never drawn. */
  readonly cancel: () => void;
}

export class CancelledDraw extends Error {
  constructor() {
    super('sticker draw cancelled');
  }
}

export type TaskScheduler = (task: () => void) => () => void;

const macrotask: TaskScheduler = (task) => {
  const handle = setTimeout(task, 0);
  return () => clearTimeout(handle);
};

export class DrawQueue<T> {
  readonly #jobs = new Map<string, Pending<T>>();
  readonly #schedule: TaskScheduler;
  #cancelTask: (() => void) | null = null;
  #order = 0;
  #waiterIds = 0;

  constructor(schedule: TaskScheduler = macrotask) {
    this.#schedule = schedule;
  }

  get size(): number {
    return this.#jobs.size;
  }

  request(key: string, draw: () => T, priority: number): DrawRequest<T> {
    const id = (this.#waiterIds += 1);
    let job = this.#jobs.get(key);
    if (job === undefined) {
      job = { draw, waiters: new Map(), priority, order: (this.#order += 1) };
      this.#jobs.set(key, job);
    } else {
      job.priority = Math.min(job.priority, priority);
    }
    const pending = job;
    const result = new Promise<T>((resolve, reject) => {
      pending.waiters.set(id, { resolve, reject });
    });
    this.#ensureScheduled();
    return {
      result,
      prioritise: (next) => {
        if (this.#jobs.get(key) === pending) pending.priority = next;
      },
      cancel: () => {
        const waiter = pending.waiters.get(id);
        if (waiter === undefined) return;
        pending.waiters.delete(id);
        waiter.reject(new CancelledDraw());
        if (pending.waiters.size > 0 || this.#jobs.get(key) !== pending) return;
        this.#jobs.delete(key);
        if (this.#jobs.size === 0) this.#stop();
      },
    };
  }

  #ensureScheduled(): void {
    if (this.#cancelTask !== null || this.#jobs.size === 0) return;
    this.#cancelTask = this.#schedule(() => this.#drawOne());
  }

  #stop(): void {
    this.#cancelTask?.();
    this.#cancelTask = null;
  }

  #next(): [string, Pending<T>] | undefined {
    let best: [string, Pending<T>] | undefined;
    for (const entry of this.#jobs) {
      const [, job] = entry;
      if (
        best === undefined ||
        job.priority < best[1].priority ||
        (job.priority === best[1].priority && job.order < best[1].order)
      ) {
        best = entry;
      }
    }
    return best;
  }

  #drawOne(): void {
    this.#cancelTask = null;
    const next = this.#next();
    if (next === undefined) return;
    const [key, job] = next;
    this.#jobs.delete(key);
    try {
      const value = job.draw();
      for (const waiter of job.waiters.values()) waiter.resolve(value);
    } catch (error) {
      for (const waiter of job.waiters.values()) waiter.reject(error);
    }
    this.#ensureScheduled();
  }
}
