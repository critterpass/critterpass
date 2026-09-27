# Tiles spike: PMTiles on R2

Rebuilds the Da Nang PMTiles archive and its supporting fonts/sprite from scratch, then pushes
them to the real `cp-tiles` R2 bucket (public `dev-url` access, no media-worker involved — see
the ADR for why).

```
pnpm --filter @cp/spikes run tiles:build -- --city da-nang    # planetiler → tiles/.output/da-nang.pmtiles
pnpm --filter @cp/spikes run tiles:fonts                      # glyphore → tiles/.output/fonts/**
pnpm --filter @cp/spikes run tiles:sprite                     # @napi-rs/canvas → tiles/.output/sprite/**
pnpm --filter @cp/spikes run tiles:upload -- --city da-nang   # wrangler r2 object put --remote
```

`tiles:build` needs a **Java 21+** binary — planetiler's released jar will not run on Java 17.
Point `PLANETILER_JAVA` at one if `java` on `PATH` is older (this environment needed
`brew install openjdk@21`, keg-only, then `PLANETILER_JAVA=/opt/homebrew/opt/openjdk@21/bin/java`).

Each script downloads what it needs into a throwaway temp dir and deletes it afterwards — the
only things that persist locally are the four `tiles/.output/**` artifacts (`.gitignore`d; never
committed), which `tiles:upload` then pushes to R2 and which are safe to delete once uploaded.

`style/da-nang-dark.json` is the style JSON draft `apps/mobile/src/app/(dev)/spikes/map.tsx`
imports directly; its `sources.openmaptiles.url`, `sprite` and `glyphs` fields point at the R2
public bucket URL baked in by this pass — update all three (here and in `map.tsx`) together if
the bucket's public URL ever changes.
