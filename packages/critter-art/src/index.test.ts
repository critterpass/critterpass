import { describe, expect, it } from 'vitest';

// Every other test file in this package imports internal modules by relative path; this one
// exercises the public barrel itself (`package.json`'s `exports["."]`), the only place a symbol
// silently dropped from `index.ts` — or an internal-only module accidentally left off it — would show up.
import {
  build,
  canonicalSeed,
  critters,
  findDesignedForm,
  frame,
  layout,
  resolveKind,
  resolveRenderSpec,
} from './index';

describe('public API surface (src/index.ts)', () => {
  it('resolves a real critter to a RenderSpec and builds/frames it end to end through the public API only', () => {
    const tokek = critters.find((c) => c.id === 'cp-112');
    if (!tokek) throw new Error('cp-112 missing');
    expect(canonicalSeed(tokek)).toBe(7); // guide alias, not a local `no`
    const epic = findDesignedForm('cp-112', 'epic');
    if (!epic) throw new Error('designed epic Tokek missing');
    const spec = resolveRenderSpec(tokek, { form: epic.form, sticker: { color: '#f4efe4' } });
    const model = build(spec, 96);
    expect(model.ops.length).toBeGreaterThan(0);
    expect(model.edgeOutline).not.toBeNull();
    const boxLayout = layout(spec, 96);
    expect(boxLayout.w).toBe(96);
    expect(resolveKind(spec.kind).viewBox).toEqual([100, 100]);
    expect(frame(model, 1).length).toBeGreaterThan(0);
  });
});
