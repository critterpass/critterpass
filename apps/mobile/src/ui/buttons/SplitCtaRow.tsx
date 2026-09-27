import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Row } from '../layout/Row';
import { makeStyles } from '../theme';

export interface SplitCtaRowProps {
  /** The main `PillButton`; takes the remaining width. */
  readonly primary: ReactNode;
  /** A secondary `PillButton` or an `IconButton` beside it. */
  readonly secondary: ReactNode;
  /** Put the secondary control at the start edge (3l-3). @default false */
  readonly secondaryFirst?: boolean;
}

const useStyles = makeStyles(() => ({ grow: { flex: 1 } }));

/** A primary CTA sharing its row with a secondary action (3d-3 save + go, 3l-3). */
export function SplitCtaRow({ primary, secondary, secondaryFirst = false }: SplitCtaRowProps) {
  const styles = useStyles();
  const main = <View style={styles.grow}>{primary}</View>;
  return (
    <Row gap="12" align="center">
      {secondaryFirst ? secondary : main}
      {secondaryFirst ? main : secondary}
    </Row>
  );
}
