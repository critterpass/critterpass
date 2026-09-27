/* eslint-disable lingui/no-unlocalized-strings -- SVG path commands, never rendered copy. */
/**
 * Pure path geometry for the texture tokens (docs/design-system.md §1.7). Each builder returns
 * SVG path data for a `width × height` box, which Skia draws as one path per texture layer.
 */
const n = (v: number): string => String(Math.round(v * 100) / 100);

/** Dots of radius `r` on a `grid` pitch, optionally offset (the second halftone layer). */
export function dotGridPath(
  width: number,
  height: number,
  grid: number,
  r: number,
  offset = 0,
): string {
  const parts: string[] = [];
  for (let y = grid / 2 + offset; y < height + r; y += grid) {
    for (let x = grid / 2 + offset; x < width + r; x += grid) {
      parts.push(
        `M${n(x + r)} ${n(y)}A${n(r)} ${n(r)} 0 1 0 ${n(x - r)} ${n(y)}A${n(r)} ${n(r)} 0 1 0 ${n(x + r)} ${n(y)}Z`,
      );
    }
  }
  return parts.join('');
}

/** Concentric rings every `step` around an origin given as fractions of the box (may lie outside). */
export function ringsPath(
  width: number,
  height: number,
  originX: number,
  originY: number,
  step: number,
): string {
  const cx = width * originX;
  const cy = height * originY;
  const far = Math.max(
    Math.hypot(cx, cy),
    Math.hypot(width - cx, cy),
    Math.hypot(cx, height - cy),
    Math.hypot(width - cx, height - cy),
  );
  // Rings wholly outside the box (the origin often sits below it) are skipped.
  const near = Math.hypot(
    cx - Math.min(Math.max(cx, 0), width),
    cy - Math.min(Math.max(cy, 0), height),
  );
  const parts: string[] = [];
  for (let r = Math.max(step, Math.ceil(near / step) * step); r <= far; r += step) {
    parts.push(
      `M${n(cx + r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 0 ${n(cx - r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 0 ${n(cx + r)} ${n(cy)}`,
    );
  }
  return parts.join('');
}

/** Parallel line centres at `angleDeg` (CSS gradient convention) every `period`, covering the box. */
export function stripesPath(
  width: number,
  height: number,
  angleDeg: number,
  period: number,
): string {
  const rad = (angleDeg * Math.PI) / 180;
  // Direction of each stripe, perpendicular to the gradient axis.
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const nx = -dy;
  const ny = dx;
  const diag = Math.hypot(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const parts: string[] = [];
  for (let o = -diag / 2; o <= diag / 2; o += period) {
    const px = cx + nx * o;
    const py = cy + ny * o;
    parts.push(
      `M${n(px - dx * diag)} ${n(py - dy * diag)}L${n(px + dx * diag)} ${n(py + dy * diag)}`,
    );
  }
  return parts.join('');
}

/** Vertical bars `bar` wide with `gap` between them, full height. */
export function barsPath(width: number, height: number, bar: number, gap: number): string {
  const parts: string[] = [];
  for (let x = 0; x + bar <= width; x += bar + gap) {
    parts.push(`M${n(x)} 0H${n(x + bar)}V${n(height)}H${n(x)}Z`);
  }
  return parts.join('');
}

/** Alternating conic wedges `stepDeg` wide from the box centre (sunburst rays). */
export function wedgesPath(width: number, height: number, stepDeg: number): string {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.hypot(width, height);
  const parts: string[] = [];
  for (let a = 0; a < 360; a += stepDeg * 2) {
    const a0 = (a * Math.PI) / 180;
    const a1 = ((a + stepDeg) * Math.PI) / 180;
    parts.push(
      `M${n(cx)} ${n(cy)}L${n(cx + Math.cos(a0) * r)} ${n(cy + Math.sin(a0) * r)}L${n(cx + Math.cos(a1) * r)} ${n(cy + Math.sin(a1) * r)}Z`,
    );
  }
  return parts.join('');
}

/** Splits a token layer like `"rgba(255,216,74,.2) 9pt grid"` into its colour and grid pitch. */
export function parseDotLayer(layer: string): { color: string; grid: number } {
  const match = /^(\S+)\s+([\d.]+)pt/.exec(layer);
  if (!match?.[1] || !match[2]) throw new Error(`texture: unreadable dot layer "${layer}"`);
  return { color: match[1], grid: Number(match[2]) };
}
