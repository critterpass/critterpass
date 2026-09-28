/**
 * The Skia canvas (`@napi-rs/canvas`) the review sheets are drawn with. The scripts package doesn't
 * declare it; it is loaded from the mobile app, which already depends on the workspace's catalog
 * version, so this tool adds no dependency of its own.
 */
import { createRequire } from 'node:module';
import path from 'node:path';

export interface CanvasImage {
  readonly width: number;
  readonly height: number;
}

export interface Context2D {
  fillStyle: string;
  strokeStyle: string;
  font: string;
  textBaseline: string;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  setLineDash(segments: number[]): void;
  fillText(text: string, x: number, y: number): void;
  drawImage(image: CanvasImage, x: number, y: number, width: number, height: number): void;
}

export interface Canvas {
  readonly width: number;
  readonly height: number;
  getContext(kind: '2d'): Context2D;
  toBuffer(mime: 'image/png'): Buffer;
}

interface CanvasModule {
  createCanvas: (width: number, height: number) => Canvas;
  loadImage: (source: string | Buffer) => Promise<CanvasImage>;
  GlobalFonts: {
    readonly families: readonly { readonly family: string }[];
    registerFromPath(file: string, alias: string): unknown;
  };
}

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const fromMobile = createRequire(path.join(REPO_ROOT, 'apps/mobile/package.json'));

export const { createCanvas, loadImage, GlobalFonts } = fromMobile(
  '@napi-rs/canvas',
) as CanvasModule;
