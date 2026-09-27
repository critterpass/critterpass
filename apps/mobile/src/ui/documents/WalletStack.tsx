import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { CardTone } from '../cards/tone';
import { cardBackground, surfaceToneOf } from '../cards/tone';
import type { DoodleName } from '../icons/generated';
import { Icon } from '../icons/Icon';
import { Row } from '../layout/Row';
import { PressScale } from '../press/PressScale';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface WalletItem {
  readonly key: string;
  readonly title: string;
  /** "Oct 15 · 03:30", "5 nights". */
  readonly meta: string;
  readonly tone: CardTone;
  readonly icon?: DoodleName;
}

export interface WalletStackProps {
  readonly items: readonly WalletItem[];
  readonly selectedKey: string;
  readonly onSelect: (key: string) => void;
  /** The open booking's full content (a `Ticket` body, stay details, …). */
  readonly children: ReactNode;
  readonly testID?: string;
}

const HEADER = 64;
const OVERLAP = 18;

const useStyles = makeStyles((t) => ({
  header: {
    minHeight: HEADER,
    borderTopLeftRadius: t.radius.cardBig,
    borderTopRightRadius: t.radius.cardBig,
    paddingHorizontal: t.size.cardInner.max,
    paddingTop: t.space['16'],
    paddingBottom: OVERLAP,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  overlap: { marginTop: -OVERLAP },
  open: {
    borderRadius: t.radius.cardBig,
    padding: t.size.cardInner.max,
    overflow: 'hidden',
  },
  title: { flex: 1 },
}));

/**
 * Fanned bookings (3h-1): closed bookings stack as overlapping coloured headers, the open one
 * shows in full at the front. Each header is a button; the open booking reads as selected.
 */
export function WalletStack({ items, selectedKey, onSelect, children, testID }: WalletStackProps) {
  const styles = useStyles();
  const theme = useTheme();
  const closed = items.filter((item) => item.key !== selectedKey);
  const open = items.find((item) => item.key === selectedKey);
  return (
    <View testID={testID}>
      {closed.map((item, index) => (
        <PressScale
          key={item.key}
          onPress={() => onSelect(item.key)}
          widthClass="wide"
          accessibilityLabel={`${item.title}, ${item.meta}`}
          accessibilityState={{ selected: false }}
          style={[
            styles.header,
            index > 0 ? styles.overlap : null,
            { backgroundColor: cardBackground(theme, item.tone) },
          ]}
        >
          <SurfaceToneProvider value={surfaceToneOf(item.tone)}>
            <Row gap="8" align="center">
              {item.icon ? <Icon name={item.icon} size={24} decorative /> : null}
              <Text variant="title" style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              <Text variant="label">{item.meta}</Text>
            </Row>
          </SurfaceToneProvider>
        </PressScale>
      ))}
      {open ? (
        <View
          style={[
            styles.open,
            closed.length > 0 ? styles.overlap : null,
            { backgroundColor: cardBackground(theme, open.tone) },
          ]}
          accessibilityState={{ selected: true }}
        >
          <SurfaceToneProvider value={surfaceToneOf(open.tone)}>{children}</SurfaceToneProvider>
        </View>
      ) : null}
    </View>
  );
}
