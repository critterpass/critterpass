/* eslint-disable lingui/no-unlocalized-strings -- CSS selector fragments, not JSX/UI copy. */
/** Small `data-cs="<name>"` query helpers so the page controller never hand-writes a selector twice. */
export function csEl<T extends Element = HTMLElement>(root: ParentNode, name: string): T | null {
  return root.querySelector<T>(`[data-cs="${name}"]`);
}

export function csAll<T extends Element = HTMLElement>(root: ParentNode, name: string): T[] {
  return Array.from(root.querySelectorAll<T>(`[data-cs="${name}"]`));
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}
