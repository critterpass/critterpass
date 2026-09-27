// Metro's asset plugin resolves a local `.caf`/`.ogg` import to the asset's numeric registry id;
// there is no upstream ambient declaration for either (react-native ships one for images, not
// audio) — same gap `apps/mobile/src/lib/fonts/ttf.d.ts` documents for `.ttf`.
declare module '*.caf' {
  const assetId: number;
  // Ambient asset module shim; Metro's own asset transform produces a default export, so the
  // ambient type must declare the same shape.
  export default assetId;
}

declare module '*.ogg' {
  const assetId: number;
  // Ambient asset module shim; Metro's own asset transform produces a default export, so the
  // ambient type must declare the same shape.
  export default assetId;
}
