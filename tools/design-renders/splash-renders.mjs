// The launch splash renders: the iOS launch image with its in-app layers, and the Android 12+
// splash egg's wobble frames, captured from design/Critterpass Store Assets.dc.html.
/* global document, getComputedStyle -- page callbacks run in the browser */
import { openPage } from './design-page.mjs';

/** The launch image is a square centred on the screen; 736 pt holds the whole halftone glow. */
const SPLASH_PT = 736;
const SPLASH_SCALE = 3;
/** Android 12+ splash icon: a 288 dp canvas (192 dp circle mask), drawn at xxxhdpi. */
const ANDROID_SPLASH_DP = 288;
const ANDROID_SCALE = 4;
/** The system splash wobble: the design's keyframes up to rest, sampled into frames under 1 s. */
const WOBBLE_FRAMES = 16;
const WOBBLE_FRAME_MS = 60;

/** Finds a store-assets splash frame (the phone screen under a data-screen-label) and scrolls it into view. */
async function openSplashFrame(browser, server, scale, label) {
  const { context, page } = await openPage(browser, server, scale);
  await page.goto(`${server.origin}/${encodeURIComponent('Critterpass Store Assets.dc.html')}`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });
  const frame = page.locator(`[data-screen-label="${label}"] > div`).nth(1);
  await frame.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    (l) => document.querySelector(`[data-screen-label="${l}"] canvas`)?.width > 0,
    label,
  );
  await page.waitForTimeout(1500);
  // The canvas page behind the phone frame must not leak into the transparent export.
  await frame.evaluate((el) => {
    for (let node = el.parentElement; node; node = node.parentElement) {
      node.style.background = 'transparent';
    }
  });
  return { context, page, frame };
}

/**
 * The iOS launch image and its two in-app layers. The frame is resized to a square centred on the
 * design's screen centre, and the glow's mask is pinned to the design phone's absolute geometry
 * (390 × 844 pt) so the glow keeps its size wherever the square sits.
 */
export async function renderLaunch(browser, server) {
  const { context, page, frame } = await openSplashFrame(
    browser,
    server,
    SPLASH_SCALE,
    'Splash iOS launch',
  );
  try {
    await frame.evaluate((el, side) => {
      const { width, height } = el.getBoundingClientRect();
      const glow = el.firstElementChild;
      const mask = getComputedStyle(glow).maskImage || getComputedStyle(glow).webkitMaskImage;
      const m = /at ([\d.]+)% ([\d.]+)%, (.+?) ([\d.]+)%, (.+?) ([\d.]+)%\)/.exec(mask);
      if (!m) throw new Error(`unexpected glow mask: ${mask}`);
      const [cx, cy] = [(+m[1] / 100) * width, (+m[2] / 100) * height];
      const reach = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy));
      const [x, y] = [cx + (side - width) / 2, cy + (side - height) / 2];
      const pinned = `radial-gradient(circle ${(+m[6] / 100) * reach}px at ${x}px ${y}px, ${m[3]} ${(+m[4] / 100) * reach}px, ${m[5]} ${(+m[6] / 100) * reach}px)`;
      glow.style.maskImage = pinned;
      glow.style.webkitMaskImage = pinned;
      Object.assign(el.style, {
        width: `${side}px`,
        height: `${side}px`,
        borderRadius: '0',
        boxShadow: 'none',
        background: 'transparent',
      });
    }, SPLASH_PT);
    // Exact clips: element screenshots round up to whole pixels, which would resize the image.
    const square = await frame.boundingBox();
    const launchClip = { x: square.x, y: square.y, width: SPLASH_PT, height: SPLASH_PT };
    const egg = frame.locator('doodle-art').first();
    const eggBox = await egg.boundingBox();
    const eggSize = Number(await egg.getAttribute('size'));
    const launch = await page.screenshot({ clip: launchClip, omitBackground: true });
    const eggOnly = await page.screenshot({
      clip: { x: eggBox.x, y: eggBox.y, width: eggSize, height: eggSize },
      omitBackground: true,
    });
    await egg.evaluate((el) => (el.style.visibility = 'hidden'));
    const glow = await page.screenshot({ clip: launchClip, omitBackground: true });
    return { launch, eggOnly, glow };
  } finally {
    await context.close();
  }
}

/** The Android 12+ splash egg: the design's wobble keyframes, paused at each frame's time. */
export async function renderWobble(browser, server) {
  const { context, page, frame } = await openSplashFrame(
    browser,
    server,
    ANDROID_SCALE,
    'Splash Android',
  );
  try {
    const motion = frame.locator('tg-motion').first();
    const { restMs } = await frame.evaluate((el) => {
      Object.assign(el.style, { background: 'transparent', boxShadow: 'none', borderRadius: '0' });
      // The phone camera dot and the 192 dp mask guide are annotations, not splash content.
      el.firstElementChild.style.visibility = 'hidden';
      const anchor = el.children[1];
      anchor.firstElementChild.style.visibility = 'hidden';
      for (const note of el.querySelectorAll('span')) note.style.visibility = 'hidden';
      const kf = anchor.querySelector('tg-motion').getAttribute('kf') ?? '';
      const dur = Number(anchor.querySelector('tg-motion').getAttribute('dur'));
      // Rest: the first r0 keyframe once the wobble has started.
      const stops = kf.split(';').map((s) => s.trim().split(':'));
      const rest = stops.find(([, value], i) => i > 1 && value.trim() === 'r0');
      return { restMs: Number(rest?.[0] ?? 0.5) * dur };
    });
    const box = await frame.boundingBox();
    const side = ANDROID_SPLASH_DP;
    const clip = {
      x: box.x + box.width / 2 - side / 2,
      y: box.y + box.height / 2 - side / 2,
      width: side,
      height: side,
    };
    const frames = [];
    for (let i = 0; i < WOBBLE_FRAMES; i += 1) {
      const at = (restMs * i) / (WOBBLE_FRAMES - 1);
      await motion.evaluate((el, t) => {
        for (const a of el.getAnimations()) {
          a.pause();
          a.currentTime = t;
        }
      }, at);
      frames.push(await page.screenshot({ clip, omitBackground: true }));
    }
    return frames;
  } finally {
    await context.close();
  }
}

export function wobbleDrawable(count) {
  const items = Array.from(
    { length: count },
    (_, i) =>
      `    <item android:drawable="@drawable/splash_egg_wobble_${String(i).padStart(2, '0')}" android:duration="${WOBBLE_FRAME_MS}" />`,
  );
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by tools/design-renders/export-app-icons.mjs: the Android 12+ splash egg wobble. -->
<animation-list xmlns:android="http://schemas.android.com/apk/res/android" android:oneshot="true">
${items.join('\n')}
</animation-list>
`;
}
