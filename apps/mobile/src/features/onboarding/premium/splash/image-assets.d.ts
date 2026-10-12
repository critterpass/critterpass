/** Bundled JPEGs resolve to Metro asset ids (the splash's polaroid photos). */
declare module '*.jpg' {
  const asset: number;
  export default asset;
}
