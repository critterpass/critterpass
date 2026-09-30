/** Bundled PNGs resolve to Metro asset ids (the hatch's launch-screen layers). */
declare module '*.png' {
  const asset: number;
  export default asset;
}
