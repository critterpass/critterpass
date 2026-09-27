import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { Guilloche } from '../textures/guilloche';
import { makeStyles, useTheme } from '../theme';

export interface StampSpreadProps {
  /** Page chrome ("Entries · Entrées"). */
  readonly chrome: string;
  /** "Page 13". */
  readonly page?: string;
  /** The new stamp (document family `Stamp`). */
  readonly stamp: ReactNode;
  /** Older, faded stamps on the facing page. */
  readonly older?: ReactNode;
  /** Crew signatures around the stamp (document family `SignatureLayer`). */
  readonly signatures?: ReactNode;
  /** "Stamp 13 is Bali". */
  readonly caption: string;
  readonly detail?: string;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  page: {
    backgroundColor: th.color.paper.base,
    borderRadius: th.radius.lg,
    padding: th.space['16'],
    gap: th.space['12'],
    overflow: 'hidden',
  },
  field: { minHeight: th.space['32'] * 7, alignItems: 'center', justifyContent: 'center' },
  older: { position: 'absolute', top: 0, start: 0, opacity: 0.45 },
}));

/** A passport spread with the trip's new stamp, faded older ones and the crew's signatures. */
export function StampSpread({
  chrome,
  page,
  stamp,
  older,
  signatures,
  caption,
  detail,
  testID,
}: StampSpreadProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack gap="12" testID={testID}>
      <View style={styles.page}>
        <SurfaceToneProvider value="paper">
          <Guilloche />
          <Row justify="space-between" importantForAccessibility="no-hide-descendants">
            <Text variant="monoData">{chrome}</Text>
            {page ? <Text variant="monoData">{page}</Text> : null}
          </Row>
          <View style={styles.field}>
            {older ? <View style={styles.older}>{older}</View> : null}
            {stamp}
            {signatures}
          </View>
        </SurfaceToneProvider>
      </View>
      <Stack
        gap="4"
        accessible
        accessibilityRole="text"
        accessibilityLabel={[caption, detail].filter(Boolean).join('. ')}
      >
        <Text variant="h3" color={theme.semantic.state.warning}>
          {caption}
        </Text>
        {detail ? <Text variant="bodySm">{detail}</Text> : null}
      </Stack>
    </Stack>
  );
}
