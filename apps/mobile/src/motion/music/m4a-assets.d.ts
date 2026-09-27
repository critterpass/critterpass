// Metro's asset plugin resolves a local `.m4a` import to the asset's numeric registry id; there is
// no upstream ambient declaration for it (react-native ships one for images, not audio) — same gap
// `apps/mobile/src/lib/fonts/ttf.d.ts` documents for `.ttf`.
declare module '*.m4a' {
  const assetId: number;
  // Ambient asset module shim; Metro's own asset transform produces a default export, so the
  // ambient type must declare the same shape.
  export default assetId;
}
