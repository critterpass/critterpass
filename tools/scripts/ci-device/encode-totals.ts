/**
 * Per-flow measurements the Android shards write next to their results: the Skia surfaces a flow
 * created, and what drawing new icons, stickers and hatched blocks cost the JS thread.
 */
/**
 * How many Skia surfaces (one Android TextureView per live canvas) a flow created and released.
 * React Native Skia 2.11 logs only the creation; `destroyed` counts from a version that logs both.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Every Android flow, passed or failed, leaves `<out>/skia-surfaces/<flow>.json`: the Skia
 * surfaces it created and what new icons, stickers and hatched blocks cost to draw, read from the
 * log cleared at the flow's start (a long flow can roll the oldest lines out of the device's log
 * buffer, so they are floors). Best effort: a failure here never touches the flow's result.
 */
export function recordFlowMeasurements(
  out: string,
  slug: string,
  logcat: (args: string[]) => string,
): void {
  try {
    const surfaces = logcat(['logcat', '-d', '-s', 'SkiaTextureView:V']);
    const js = logcat(['logcat', '-d', '-v', 'epoch', '-s', 'ReactNativeJS:V']);
    const dir = path.join(out, 'skia-surfaces');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, `${slug}.json`),
      JSON.stringify({
        ...countSkiaSurfaces(surfaces),
        iconEncodes: iconEncodeCost(js),
        stickerEncodes: iconEncodeCost(js, 'sticker'),
        hatchEncodes: iconEncodeCost(js, 'hatch'),
      }),
    );
  } catch {
    // A count is a measurement, never a reason to fail the shard.
  }
}

export function countSkiaSurfaces(log: string): {
  created: number;
  destroyed: number;
  /** Created surfaces by pixel size ("89x90"), to tell icons from stickers and scenes. */
  sizes: Record<string, number>;
} {
  let created = 0;
  let destroyed = 0;
  const sizes: Record<string, number> = {};
  for (const line of log.split('\n')) {
    const available = /onSurfaceTextureAvailable:\s*(\d+x\d+)?/.exec(line);
    if (available !== null) {
      created += 1;
      const size = available[1] ?? '?';
      sizes[size] = (sizes[size] ?? 0) + 1;
    } else if (line.includes('onSurfaceTextureDestroyed')) destroyed += 1;
  }
  return { created, destroyed, sizes };
}

/**
 * What drawing icons (or stickers, or hatched blocks) cost the JS thread in a flow, from the app's
 * `[<kind>-encode] <ms>` lines (QA builds): how many new icons were drawn, the total time, and the busiest second.
 */
export function iconEncodeCost(
  log: string,
  kind: 'icon' | 'sticker' | 'hatch' = 'icon',
): {
  count: number;
  totalMs: number;
  busiestSecondMs: number;
  slowestMs: number;
} {
  let count = 0;
  let totalMs = 0;
  let slowestMs = 0;
  const bySecond = new Map<string, number>();
  for (const line of log.split('\n')) {
    const match = new RegExp(`^\\s*(\\d+)\\.\\d+.*\\[${kind}-encode\\] ([\\d.]+)`).exec(line);
    if (match === null) continue;
    const [, second = '', msText = '0'] = match;
    const ms = Number(msText);
    count += 1;
    totalMs += ms;
    slowestMs = Math.max(slowestMs, ms);
    bySecond.set(second, (bySecond.get(second) ?? 0) + ms);
  }
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    count,
    totalMs: round(totalMs),
    busiestSecondMs: round(Math.max(0, ...bySecond.values())),
    slowestMs: round(slowestMs),
  };
}
