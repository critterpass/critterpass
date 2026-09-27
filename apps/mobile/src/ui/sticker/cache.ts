/**
 * Byte-sized LRU cache keyed by spec key, storing whatever encoded payload the caller gives it
 * (this package always stores PNG bytes — see `StickerCache` below). A `Map`'s insertion order
 * doubles as recency order: `get` re-inserts the hit at the end, `set` evicts from the front.
 */
export class MemoryLruCache {
  readonly #entries = new Map<string, Uint8Array>();
  #bytes = 0;

  constructor(private readonly maxBytes: number) {}

  get bytes(): number {
    return this.#bytes;
  }

  get(key: string): Uint8Array | undefined {
    const value = this.#entries.get(key);
    if (value === undefined) return undefined;
    this.#entries.delete(key);
    this.#entries.set(key, value);
    return value;
  }

  set(key: string, value: Uint8Array): void {
    const existing = this.#entries.get(key);
    if (existing) this.#bytes -= existing.byteLength;
    this.#entries.set(key, value);
    this.#bytes += value.byteLength;
    this.#evictOverBudget();
  }

  /** Drops every entry — the low-memory-warning path. */
  clear(): void {
    this.#entries.clear();
    this.#bytes = 0;
  }

  #evictOverBudget(): void {
    for (const [key, value] of this.#entries) {
      if (this.#bytes <= this.maxBytes) break;
      this.#entries.delete(key);
      this.#bytes -= value.byteLength;
    }
  }
}

/** The filesystem operations the disk cache needs — implemented over `expo-file-system` on device, an in-memory fake in tests. */
export interface StickerDiskFs {
  readonly cacheDirectory: string;
  exists(path: string): Promise<boolean>;
  readBytes(path: string): Promise<Uint8Array>;
  writeBytes(path: string, bytes: Uint8Array): Promise<void>;
  deleteFile(path: string): Promise<void>;
  listFiles(dir: string): Promise<string[]>;
  statFile(path: string): Promise<{ readonly size: number; readonly modifiedMs: number }>;
}

function safeFileName(key: string): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- on-disk filename suffix, never shown to a user
  return `${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
}

/** Disk-backed PNG cache with an LRU sweep (by file modification time) when writes push it over `maxBytes`. */
export class DiskLruCache {
  readonly #dir: string;

  constructor(
    private readonly fs: StickerDiskFs,
    private readonly maxBytes: number,
    subdir = 'stickers',
  ) {
    this.#dir = `${fs.cacheDirectory}${subdir}/`;
  }

  #pathFor(key: string): string {
    return `${this.#dir}${safeFileName(key)}`;
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    const path = this.#pathFor(key);
    if (!(await this.fs.exists(path))) return undefined;
    return this.fs.readBytes(path);
  }

  async set(key: string, bytes: Uint8Array): Promise<void> {
    await this.fs.writeBytes(this.#pathFor(key), bytes);
    await this.sweep();
  }

  /** Evicts the oldest files (by mtime) until total disk usage is back under `maxBytes`. */
  async sweep(): Promise<void> {
    const files = await this.fs.listFiles(this.#dir);
    const stats = await Promise.all(
      files.map(async (name) => ({ name, ...(await this.fs.statFile(`${this.#dir}${name}`)) })),
    );
    let total = stats.reduce((sum, s) => sum + s.size, 0);
    if (total <= this.maxBytes) return;

    const oldestFirst = [...stats].sort((a, b) => a.modifiedMs - b.modifiedMs);
    for (const file of oldestFirst) {
      if (total <= this.maxBytes) break;
      await this.fs.deleteFile(`${this.#dir}${file.name}`);
      total -= file.size;
    }
  }
}

export type Scheduler = (task: () => void) => void;

/** Default prewarm scheduler: `setTimeout(task, 0)`, keeping renders off the current JS frame without depending on React Native's `InteractionManager` at the module level (callers on-device may pass `InteractionManager.runAfterInteractions` instead). */
export const macrotaskScheduler: Scheduler = (task) => {
  setTimeout(task, 0);
};

/**
 * The sticker image cache: memory LRU (25 MB default) in front of a disk LRU (60 MB default),
 * keyed by `specKey`. `render` is only called on a miss in both layers.
 */
export class StickerCache {
  constructor(
    private readonly memory: MemoryLruCache,
    private readonly disk: DiskLruCache,
  ) {}

  async getOrRender(key: string, render: () => Promise<Uint8Array>): Promise<Uint8Array> {
    const cached = this.memory.get(key);
    if (cached) return cached;

    const onDisk = await this.disk.get(key);
    if (onDisk) {
      this.memory.set(key, onDisk);
      return onDisk;
    }

    const bytes = await render();
    this.memory.set(key, bytes);
    await this.disk.set(key, bytes);
    return bytes;
  }

  /** Clears the memory tier only — the disk tier survives a low-memory warning. */
  handleMemoryWarning(): void {
    this.memory.clear();
  }

  /** Renders every not-yet-cached key off the current frame via `schedule` (default: a macrotask). */
  prewarm(
    keys: readonly { readonly key: string; readonly render: () => Promise<Uint8Array> }[],
    schedule: Scheduler = macrotaskScheduler,
  ): void {
    for (const { key, render } of keys) {
      if (this.memory.get(key)) continue;
      schedule(() => {
        void this.getOrRender(key, render);
      });
    }
  }
}
