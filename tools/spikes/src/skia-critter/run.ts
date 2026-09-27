// Rerun: pnpm --filter @cp/spikes run skia-critter
// Regenerates the Node prerender + the real design-source reference PNG into a scratch dir, and
// prints a host-Mac timing signal for the ribbon-tessellation cost this spike is about (NOT a
// device fps number — see docs/decisions/20260927-skia-critter-painter-perf.md for the simulator
// and Android-emulator captures that stand in for the phase's reference physical devices here).
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { renderReferenceGeckoPng } from './design-source-reference';
import { renderGeckoToPng } from './node-canvas-surface';

function percentile(samplesMs: readonly number[], p: number): number {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

async function main(): Promise<void> {
  const outDir = mkdtempSync(path.join(tmpdir(), 'cp-skia-critter-'));

  const single = renderGeckoToPng({ size: 200, progress: 1 });
  writeFileSync(path.join(outDir, 'node-prerender.png'), single.png);

  const reference = await renderReferenceGeckoPng({ size: 200, pose: 'idle' });
  writeFileSync(path.join(outDir, 'design-source-reference.png'), reference);

  // Draw-on cost signal: repeatedly re-render a full frame, the way one critter would every frame
  // while its blink/idle-bob loop is live. Host-Mac Node timing only — see the ADR for real
  // simulator/emulator on-screen fps captured from the RN dev routes.
  const singleFrameSamplesMs: number[] = [];
  for (let i = 0; i < 200; i += 1) singleFrameSamplesMs.push(renderGeckoToPng({ size: 200, progress: 1 }).renderMs);

  // Approximates one animation frame's worth of ribbon tessellation for a realistic Critterdex
  // viewport (6 idle bobbing critters, per code-standards.md §7's "≤2 concurrent draw-ons" budget
  // read together with phase-02's "6 idle bobbing critters") plus a FlashList/Legend List
  // recycle window of ~24 on-screen cells re-painting from cache misses.
  const concurrentCritterCount = 6;
  const scrollRecycleWindow = 24;
  const frameBudgetSamplesMs: number[] = [];
  for (let i = 0; i < 50; i += 1) {
    const start = performance.now();
    for (let c = 0; c < concurrentCritterCount + scrollRecycleWindow; c += 1) {
      renderGeckoToPng({ size: 96, progress: 1 });
    }
    frameBudgetSamplesMs.push(performance.now() - start);
  }

  console.log(`skia-critter spike — outputs in ${outDir}`);
  console.log(
    `single full-frame render (host Mac, Node/@napi-rs/canvas): p50 ${percentile(singleFrameSamplesMs, 50).toFixed(3)} ms, p95 ${percentile(singleFrameSamplesMs, 95).toFixed(3)} ms`,
  );
  console.log(
    `simulated frame (${concurrentCritterCount} idle + ${scrollRecycleWindow} grid recycles, host Mac): p50 ${percentile(frameBudgetSamplesMs, 50).toFixed(2)} ms, p95 ${percentile(frameBudgetSamplesMs, 95).toFixed(2)} ms (budget: 16.6 ms @60fps / 8.3 ms @120fps)`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
