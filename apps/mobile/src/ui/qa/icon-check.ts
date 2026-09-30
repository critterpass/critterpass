import { reportUiQa, UI_QA_ENABLED } from './ui-qa';

/* eslint-disable lingui/no-unlocalized-strings -- colour keywords and report codes, never shown */

/** One shape an icon is about to draw: its resolved paint (none when it has no colour) and opacity. */
export interface QaIconLayer {
  readonly fill: string | undefined;
  readonly opacity?: number | undefined;
}

/** A colour string that draws nothing: `transparent`, or an alpha of zero (#rgba, #rrggbbaa, rgba). */
function invisible(colour: string): boolean {
  const value = colour.trim().toLowerCase();
  if (value === 'transparent') return true;
  if (/^#[0-9a-f]{4}$/.test(value)) return value.endsWith('0');
  if (/^#[0-9a-f]{8}$/.test(value)) return value.endsWith('00');
  const alpha = /^rgba?\([^)]*,\s*([\d.]+)\s*\)$/.exec(value)?.[1];
  return alpha !== undefined && Number(alpha) === 0;
}

/** True when none of the icon's shapes would leave a mark: no paint, zero opacity or a clear colour. */
export function iconDrawsNothing(layers: readonly QaIconLayer[]): boolean {
  return !layers.some(
    (layer) => layer.fill !== undefined && (layer.opacity ?? 1) > 0 && !invisible(layer.fill),
  );
}

/** Reports ICON_EMPTY for an icon (`name`) whose shapes would all draw nothing. */
export function checkIconDraws(name: string, layers: readonly QaIconLayer[]): void {
  if (UI_QA_ENABLED && iconDrawsNothing(layers)) reportUiQa('ICON_EMPTY', name);
}
