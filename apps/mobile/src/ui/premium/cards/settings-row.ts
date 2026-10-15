import type { ReactNode } from 'react';

import type { DoodleName } from '../icons/doodles/generated';

/** A coloured icon tile before a row's title (Help and feedback). */
export interface SettingsLeading {
  readonly icon: DoodleName;
  readonly tint: 'pink' | 'yellow' | 'blue' | 'green';
}

interface RowBase {
  readonly key: string;
  readonly leading?: SettingsLeading;
  /** A leading tile the caller draws itself (Pings' art tiles); shown in place of `leading`. */
  readonly leadingNode?: ReactNode;
  /** The row's own id; a toggle row's switch gets `{testID}-toggle`. */
  readonly testID?: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly disabled?: boolean;
}

/** One row of a settings list, as a view model builds it and the settings screen draws it. */
export type SettingsRow =
  | (RowBase & {
      readonly kind: 'value';
      readonly value: string;
      readonly onPress: () => void;
      /** Drawn in place of the value and chevron (Rate's star). */
      readonly valueIcon?: DoodleName;
    })
  | (RowBase & {
      readonly kind: 'toggle';
      readonly value: boolean;
      readonly onChange: (next: boolean) => void;
    })
  | (RowBase & { readonly kind: 'check'; readonly checked: boolean; readonly onPress?: () => void })
  | (RowBase & { readonly kind: 'private'; readonly onPress?: () => void })
  | (RowBase & { readonly kind: 'destructive'; readonly onPress: () => void })
  | (RowBase & { readonly kind: 'custom'; readonly trailing: ReactNode });
