// Metro's asset plugin resolves a local `.ttf` import to the asset's numeric registry id; there is
// no upstream ambient declaration for this (react-native ships one for images, not fonts).
declare module '*.ttf' {
  const assetId: number;
  // Ambient asset module shim; Metro's own asset transform produces a default export, so the
  // ambient type must declare the same shape.
  // eslint-disable-next-line no-restricted-syntax
  export default assetId;
}
