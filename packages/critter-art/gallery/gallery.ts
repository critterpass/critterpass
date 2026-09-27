import { critters } from '../src/data/critters';
import type { Pose, Variant } from '../src/core/model';
import type { GalleryCard, GallerySettings, Rarity } from './gallery-render';
import { renderCard, resolveCard } from './gallery-render';

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`gallery.ts: #${id} not found in index.html`);
  return found as T;
}

const searchInput = el<HTMLInputElement>('search');
const raritySelect = el<HTMLSelectElement>('rarity');
const poseSelect = el<HTMLSelectElement>('poseOverride');
const variantSelect = el<HTMLSelectElement>('variant');
const sizeSelect = el<HTMLSelectElement>('size');
const seedModeSelect = el<HTMLSelectElement>('seedMode');
const backgroundSelect = el<HTMLSelectElement>('background');
const stickerCheckbox = el<HTMLInputElement>('sticker');
const blinkCheckbox = el<HTMLInputElement>('blink');
const replayButton = el<HTMLButtonElement>('replay');
const status = el<HTMLSpanElement>('status');
const grid = el<HTMLElement>('grid');

/** One entry per currently rendered cell, kept around so "Replay draw-on" can re-animate them without rebuilding the DOM. */
let liveCards: Array<{ card: GalleryCard; canvas: HTMLCanvasElement }> = [];
let replayHandle: number | null = null;

function readSettings(): GallerySettings {
  return {
    rarity: raritySelect.value as Rarity,
    poseOverride: poseSelect.value === '' ? null : (poseSelect.value as Pose),
    variant: variantSelect.value as Variant,
    sizePt: Number(sizeSelect.value),
    sticker: stickerCheckbox.checked,
    blink: blinkCheckbox.checked,
    seedMode: seedModeSelect.value as 'design' | 'stable',
  };
}

function matchesSearch(card: GalleryCard, query: string): boolean {
  if (query === '') return true;
  const needle = query.toLowerCase();
  const { critter } = card;
  return (
    critter.id.toLowerCase().includes(needle) ||
    critter.name.toLowerCase().includes(needle) ||
    critter.species.toLowerCase().includes(needle)
  );
}

function buildCell(
  card: GalleryCard,
  sizePt: number,
): { cell: HTMLElement; canvas: HTMLCanvasElement } {
  const cell = document.createElement('div');
  cell.className = 'cell';
  const canvas = renderCard(card.spec, sizePt, 1);
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = `${card.critter.name} (${card.critter.id})`;
  cell.append(canvas, label);
  if (card.undesigned) {
    const note = document.createElement('div');
    note.className = 'undesigned';
    note.textContent = 'undesigned form (pose only)';
    cell.append(note);
  }
  return { cell, canvas };
}

/** Rebuilds the whole grid from the current controls -- simplest correct behaviour for ~150 cells; see gallery-render.ts for how each critter resolves to a spec. */
function rebuild(): void {
  if (replayHandle !== null) {
    cancelAnimationFrame(replayHandle);
    replayHandle = null;
  }
  const settings = readSettings();
  const query = searchInput.value.trim();
  grid.replaceChildren();
  liveCards = [];
  let undesignedCount = 0;

  const fragment = document.createDocumentFragment();
  for (const critter of critters) {
    const card = resolveCard(critter, settings);
    if (!matchesSearch(card, query)) continue;
    if (card.undesigned) undesignedCount++;
    const { cell, canvas } = buildCell(card, settings.sizePt);
    fragment.append(cell);
    liveCards.push({ card, canvas });
  }
  grid.append(fragment);
  status.textContent = `${liveCards.length} shown, ${undesignedCount} undesigned at this rarity`;
}

/** design's own `easeInOutQuad`, matching how the app eases every draw-on caller-side. */
function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function replay(): void {
  if (replayHandle !== null) cancelAnimationFrame(replayHandle);
  const settings = readSettings();
  const durationMs = 1500;
  const start = performance.now();
  const tick = (now: number): void => {
    const elapsed = now - start;
    const p = easeInOutQuad(Math.min(1, elapsed / durationMs));
    for (const entry of liveCards) {
      const nextCanvas = renderCard(entry.card.spec, settings.sizePt, p);
      entry.canvas.replaceWith(nextCanvas);
      entry.canvas = nextCanvas;
    }
    replayHandle = elapsed < durationMs ? requestAnimationFrame(tick) : null;
  };
  replayHandle = requestAnimationFrame(tick);
}

function applyBackground(): void {
  document.body.classList.toggle('dark', backgroundSelect.value === 'dark');
}

for (const control of [
  raritySelect,
  poseSelect,
  variantSelect,
  sizeSelect,
  seedModeSelect,
  stickerCheckbox,
  blinkCheckbox,
]) {
  control.addEventListener('change', rebuild);
}
searchInput.addEventListener('input', rebuild);
backgroundSelect.addEventListener('change', () => {
  applyBackground();
});
replayButton.addEventListener('click', replay);

applyBackground();
rebuild();
