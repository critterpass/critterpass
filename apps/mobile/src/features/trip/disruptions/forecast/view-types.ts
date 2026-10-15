import type { ForecastModel, WatchEntry } from './model';
import type { GuideStickerId } from '@/ui/premium/stickers/guides';

export interface ForecastViewProps {
  readonly state: 'loading' | 'ready';
  readonly model: ForecastModel;
  readonly place: string;
  readonly tz: string;
  readonly guide: GuideStickerId;
  readonly offline: boolean;
  readonly themeFor: (date: string) => string | null;
  /** A watch row's title and detail in the reader's language. */
  readonly wordsFor: (entry: WatchEntry) => { readonly title: string; readonly detail: string };
  readonly onBack: () => void;
  readonly onOpenStorm: (pollId: string) => void;
}
