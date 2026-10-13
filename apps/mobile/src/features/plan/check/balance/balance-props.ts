export interface BalanceRowView {
  readonly key: string;
  readonly name: string;
  readonly joinIndex: number;
  readonly mustDo: string | null;
  readonly saved: number;
  readonly placed: number;
  readonly count: string;
}

export interface BalanceOfferView {
  readonly line: string;
  readonly joinIndex: number;
  readonly initialName: string;
  readonly places: readonly {
    readonly key: string;
    readonly name: string;
    readonly when: string;
  }[];
  readonly add: {
    readonly label: string;
    readonly busy: boolean;
    readonly onPress: () => void;
  } | null;
  readonly ask: {
    readonly label: string;
    readonly busy: boolean;
    readonly onPress: (() => void) | null;
  };
  readonly status: string | null;
}

export interface BalanceViewProps {
  readonly backLabel: string;
  readonly onBack: () => void;
  readonly onlyYou: string;
  readonly title: string;
  readonly summary: string;
  readonly loading: boolean;
  readonly rows: readonly BalanceRowView[];
  readonly offer: BalanceOfferView | null;
}
