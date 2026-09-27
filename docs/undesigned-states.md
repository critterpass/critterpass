# Undesigned states

States and assets built from existing components/tokens because no design render or product
decision covers them yet. Logged here per `CLAUDE.md` for founder review — not silently shipped as
if they were verified design values.

| Screen / asset | State | Rationale |
| --- | --- | --- |
| App icon "HOME SET" (`packages/critter-bake/src/templates/app-icons.ts`) | Earned icon character mapping | `docs/product-decisions.md`'s "Live guides" line names Tokek/Pon/Lundi/Ajo/Sardi/Paco; none is "home"-themed, and no other doc gives the real "HOME SET" criteria. Placeholder: Lundi (puffin) — the one guide left over once temple/golden/bali-six (Tokek), pon (Pon) and sardi (Sardi) are assigned to their confirmed matches. Founder to confirm the real unlock criteria and character before this ships as a real earned icon. |
| App icon "BALI SIX" (`packages/critter-bake/src/templates/app-icons.ts`) | Earned icon character mapping | Reads as a Bali milestone (Tokek is Bali's guide per `docs/product-decisions.md`), but no doc gives the actual "six" criteria or asks for a character distinct from `golden`/`temple`. Placeholder: common Tokek (gecko), "point" pose, Tokek's guide colour — distinguishable from `temple` (rare, idle) and `golden` (legendary, idle) by tier/pose only. Founder to confirm the real criteria before this ships. |
| App icon PASSPORT/STAMP chrome (`packages/critter-bake/src/templates/app-icons.ts`) | Simplified ornamental detail | `design/App Icon.dc.html`'s passport card has a vertical "PASSPORT" wordmark and two 3-dot "hand" clusters; its stamp ring is dashed. `packages/critter-art/src/share/model.ts`'s `RectNode`/`TextNode` have no dashed-border or tiny-rotated-glyph primitives, and building them just for this icon-only chrome wasn't worth extending the shared card model for. Both chrome layouts keep every other DC pixel value (card position/rotation, ring diameter, photo circle) — only these two fine details are dropped. Founder to confirm this reads correctly at 1024px/60pt before shipping; if not, the fix is extending `RectNode` with a stroke-only variant, not redrawing the icons. |
