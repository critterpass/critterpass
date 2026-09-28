export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where the cut-out sits in the circle: as large as fits inside the side insets, bottom-anchored
 * and sunk one outline below the frame. A lifted subject usually ends flat where the photo was
 * cropped (the shoulders); anchored this way that edge, and the edge traced along it, fall under
 * the circle's rim instead of reading as a cut line across the avatar.
 */
export function cutoutFrame(
  side: number,
  outline: number,
  imageWidth: number,
  imageHeight: number,
): Rect {
  if (imageWidth <= 0 || imageHeight <= 0) return { x: 0, y: 0, width: side, height: side };
  const scale = Math.min((side - outline * 2) / imageWidth, side / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { x: (side - width) / 2, y: side + outline - height, width, height };
}
