/** The two shapes a share card comes in. */
export type ShareFormat = 'post' | 'story';

/** The pixel size of each shape: every share card draws at these, and the preview keeps the ratio. */
export const SHARE_SIZE: Readonly<Record<ShareFormat, { readonly w: number; readonly h: number }>> =
  {
    post: { w: 1080, h: 1350 },
    story: { w: 1080, h: 1920 },
  };
