/**
 * An in-memory stand-in for `expo-file-system`'s File/Directory/Paths (the device file system has
 * no Jest host): files exist once `downloadFileAsync` wrote them or a suite `seed`s them.
 */
const files = new Set<string>();
export const downloads: string[] = [];

function join(parts: readonly (string | { uri: string })[]): string {
  return parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
}

export class Directory {
  readonly uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = join(parts);
  }
  get exists(): boolean {
    return true;
  }
  create(): void {}
}

export class File {
  readonly uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = join(parts);
  }
  get exists(): boolean {
    return files.has(this.uri);
  }
  static downloadFileAsync(url: string, target: File): Promise<File> {
    downloads.push(url);
    files.add(target.uri);
    return Promise.resolve(target);
  }
}

// eslint-disable-next-line lingui/no-unlocalized-strings -- a file URI, never copy.
export const Paths = { document: { uri: 'file:///docs' } };

export function seed(uri: string): void {
  files.add(uri);
}

export function reset(): void {
  files.clear();
  downloads.length = 0;
}
