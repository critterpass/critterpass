import { describe, expect, it } from 'vitest';

import { parseBounds, scanHierarchy, type HierarchyNode } from './a11y-scan';

const node = (
  attributes: Record<string, string>,
  children: HierarchyNode[] = [],
): HierarchyNode => ({ attributes, children });

describe('hierarchy scan', () => {
  it('reads Maestro bounds and rejects anything else', () => {
    expect(parseBounds('[10,20][110,64]')).toEqual({ width: 100, height: 44 });
    expect(parseBounds('')).toBeUndefined();
    expect(parseBounds(undefined)).toBeUndefined();
  });

  it('accepts a control named by itself or by a descendant', () => {
    const root = node({ bounds: '[0,0][400,800]' }, [
      node({ clickable: 'true', bounds: '[0,0][100,50]', accessibilityText: 'Close' }),
      node({ clickable: 'true', bounds: '[0,60][100,110]' }, [
        node({ bounds: '[0,60][100,110]' }, [node({ text: 'Join crew' })]),
      ]),
    ]);
    expect(scanHierarchy(root)).toEqual([]);
  });

  it('reports an unnamed control and a small target, in points for the device density', () => {
    const root = node({ bounds: '[0,0][1080,2400]' }, [
      node({ clickable: 'true', bounds: '[0,0][132,132]', 'resource-id': 'icon-button' }),
      node({ clickable: 'true', bounds: '[0,200][90,332]', text: 'Skip' }),
    ]);
    // 132 px is 44 pt at 3×, 90 px is 30 pt.
    expect(scanHierarchy(root, 3)).toEqual([
      { kind: 'unnamed', node: 'icon-button', detail: 'no text or label' },
      { kind: 'small-target', node: '[0,200][90,332]', detail: '30×44 pt' },
    ]);
  });

  it('skips disabled, untappable and zero-area nodes', () => {
    const root = node({}, [
      node({ clickable: 'true', enabled: 'false', bounds: '[0,0][10,10]' }),
      node({ clickable: 'false', bounds: '[0,0][10,10]' }),
      node({ clickable: 'true', bounds: '[0,0][0,0]' }),
    ]);
    expect(scanHierarchy(root)).toEqual([]);
  });
});
