export interface SwapRowView {
  readonly key: string;
  readonly name: string;
  readonly color: string;
  readonly from: string;
  readonly to: string;
  readonly why: string;
  readonly ticked: boolean;
}

export interface RainViewProps {
  readonly backLabel: string;
  readonly onBack: () => void;
  readonly chip: string | null;
  readonly title: string;
  readonly source: string;
  readonly state: 'loading' | 'none' | 'ready';
  readonly chart: SwapChartProps | null;
  readonly rows: readonly SwapRowView[];
  readonly onToggle: (key: string) => void;
  readonly primary: {
    readonly label: string;
    readonly busy: boolean;
    readonly onPress: () => void;
  } | null;
  readonly send: (() => void) | null;
}

export interface ChartBlock {
  readonly key: string;
  /** Local minutes of the day. */
  readonly start: number;
  readonly end: number;
  readonly color: string;
  readonly inTheWay: boolean;
}

export interface SwapChartProps {
  readonly rain: { readonly from: number; readonly to: number } | null;
  readonly crowds: readonly number[] | null;
  readonly busyLevel: number;
  readonly now: readonly ChartBlock[];
  readonly swapped: readonly ChartBlock[];
  readonly width: number;
  readonly reducedMotion: boolean;
}

export const CHART_FROM = 7 * 60;

export const CHART_TO = 20 * 60;
