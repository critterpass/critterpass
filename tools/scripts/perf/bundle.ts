/**
 * App size: a store build's `.ipa` approximates the iOS download size (§9 budget ≤40 MB before
 * content). Megabytes here are 10^6 bytes, as App Store Connect reports them.
 */
import { statSync } from 'node:fs';

export function fileMb(path: string): number {
  return Math.round((statSync(path).size / 1e6) * 10) / 10;
}
