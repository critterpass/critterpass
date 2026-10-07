/**
 * For component tests of screens that hold private details: puts up the mask a problem report's
 * screenshot is taken under, and tells whether a rendered node sits under a `PrivateContent` cover.
 */
import { act } from '@testing-library/react-native';

import { maskStore } from '../mask';

const COVER = 'private-content-cover';

/** A rendered node of either test renderer: only its parent, children and props are read. */
interface Rendered {
  readonly parent: Rendered | null;
  readonly children: readonly (Rendered | string)[];
  readonly props: Readonly<Record<string, unknown>>;
}

/** Runs `check` while the parts mask is up, and takes it down whatever happens. */
export async function whileMasked(check: () => void | Promise<void>): Promise<void> {
  await act(async () => {
    maskStore.set('parts');
    await Promise.resolve();
  });
  try {
    await check();
  } finally {
    await act(async () => {
      maskStore.set(null);
      await Promise.resolve();
    });
  }
}

/** Whether a screenshot taken now would have this node covered. */
export function isCovered(node: Rendered): boolean {
  for (let at = node.parent; at !== null; at = at.parent) {
    const covered = at.children.some(
      (child) => typeof child !== 'string' && child.props['testID'] === COVER,
    );
    if (covered) return true;
  }
  return false;
}
