/** Bundled PNGs resolve to Metro asset ids (the launch layers). */
declare module '*.png' {
  const asset: number;
  export default asset;
}
