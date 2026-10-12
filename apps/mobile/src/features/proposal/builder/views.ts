import type { ComponentType } from 'react';

import { AloneView, type AloneViewProps } from './alone-view';
import { BuilderView, type BuilderViewProps } from './builder-view';
import { ReplyBySheet, type ReplyBySheetProps } from './reply-by-sheet';
import { SendProgress, type SendProgressProps } from './send-progress';

/** The builder's four faces; the premium look passes its own, the logic stays here. */
export interface BuilderViews {
  readonly Builder: ComponentType<BuilderViewProps>;
  readonly Alone: ComponentType<AloneViewProps>;
  readonly Sent: ComponentType<SendProgressProps>;
  readonly ReplyBy: ComponentType<ReplyBySheetProps>;
}

export const LEGACY_VIEWS: BuilderViews = {
  Builder: BuilderView,
  Alone: AloneView,
  Sent: SendProgress,
  ReplyBy: ReplyBySheet,
};
