import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Avatar } from '../people/Avatar';
import { Row } from '../layout/Row';
import { makeStyles } from '../theme';

export interface PendingSyncProps {
  readonly children: ReactNode;
  /** While true the item is written locally but not yet confirmed by the server. */
  readonly pending: boolean;
  /** Who wrote it: their avatar bobs beside the pending item. */
  readonly author?: { readonly name: string; readonly joinIndex: number };
  /** The item's own label; ", sending" is appended while pending. */
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

const PENDING_OPACITY = 0.55;

const useStyles = makeStyles(() => ({
  body: { flex: 1, minWidth: 0 },
}));

/** A locally written, not-yet-synced item: faded to .55 with the author's avatar bobbing. */
export function PendingSync({
  children,
  pending,
  author,
  accessibilityLabel,
  testID,
}: PendingSyncProps) {
  const styles = useStyles();
  const label = pending
    ? t({ id: 'common.pending.sending', message: `${accessibilityLabel}, sending` })
    : accessibilityLabel;
  return (
    <Row testID={testID} gap="8" align="center" accessible accessibilityLabel={label}>
      <View style={[styles.body, pending ? { opacity: PENDING_OPACITY } : null]}>{children}</View>
      {pending && author ? (
        <Avatar name={author.name} joinIndex={author.joinIndex} size="sm" pending decorative />
      ) : null}
    </Row>
  );
}
