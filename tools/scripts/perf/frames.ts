/**
 * Frame pacing on Android from `adb shell dumpsys gfxinfo <package>` after a scripted scroll
 * (the Maestro journey). The 90th percentile frame time gives the rate the user feels:
 * 1000 / p90 ms, capped at the display's 60 Hz budget the §9 table states for mid Android.
 */
export interface FrameStats {
  readonly frames: number;
  readonly jankyPercent: number;
  readonly p90Ms: number;
  readonly fps: number;
}

export function parseGfxinfo(output: string): FrameStats | undefined {
  const frames = /Total frames rendered:\s*(\d+)/u.exec(output);
  const janky = /Janky frames:\s*\d+\s*\(([\d.]+)%\)/u.exec(output);
  const p90 = /90th percentile:\s*(\d+)ms/u.exec(output);
  if (!frames || !p90 || Number(frames[1]) === 0) return undefined;
  const p90Ms = Number(p90[1]);
  return {
    frames: Number(frames[1]),
    jankyPercent: janky ? Number(janky[1]) : 0,
    p90Ms,
    fps: Math.min(60, Math.round((1000 / Math.max(p90Ms, 1)) * 10) / 10),
  };
}
