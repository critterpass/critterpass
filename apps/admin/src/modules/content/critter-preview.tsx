/**
 * Draws a critter form in the browser with the same renderer the app and bake use, so reviewers see
 * exactly what the batch would ship: the unlocked form or its locked silhouette.
 */
import {
  build,
  canonicalSeed,
  critters,
  frame,
  layout,
  type FormSpec,
  type RenderSpec,
} from '@cp/critter-art';
import { renderToCanvas, viewportFor, type CanvasLike } from '@cp/critter-art/canvas2d';
import { useEffect, useRef } from 'react';

const byId = new Map(critters.map((critter) => [critter.id, critter]));

function domCanvas(width: number, height: number): CanvasLike {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas as unknown as CanvasLike;
}

export interface CritterPreviewProps {
  readonly critterId: string;
  readonly form?: FormSpec | undefined;
  readonly locked?: boolean;
  readonly size: number;
  readonly label: string;
}

export function CritterPreview({
  critterId,
  form,
  locked = false,
  size,
  label,
}: CritterPreviewProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = ref.current;
    const critter = byId.get(critterId);
    if (target === null || critter === undefined) return;
    const spec: RenderSpec = {
      kind: critter.kind,
      seed: canonicalSeed(critter),
      ...(form === undefined
        ? {}
        : { form, ...(form.pose === undefined ? {} : { pose: form.pose }) }),
      ...(locked ? { variant: 'mask' as const } : {}),
    };
    const scale = window.devicePixelRatio || 1;
    const viewport = viewportFor(layout(spec, size), scale);
    const rendered = renderToCanvas(frame(build(spec, size), 1), viewport, domCanvas);
    target.width = viewport.widthPx;
    target.height = viewport.heightPx;
    target.style.width = `${viewport.widthPx / scale}px`;
    target.style.height = `${viewport.heightPx / scale}px`;
    const ctx = target.getContext('2d');
    ctx?.clearRect(0, 0, target.width, target.height);
    ctx?.drawImage(rendered as unknown as CanvasImageSource, 0, 0);
  }, [critterId, form, locked, size]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      style={{ display: 'block', margin: '0 auto' }}
    />
  );
}
