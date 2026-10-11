/**
 * The months up to the next trip (9.23): paused months short and hatched, the trip's month tall
 * in ink with a plane over it. Read as one line by screen readers.
 */
/* eslint-disable lingui/no-unlocalized-strings -- colour values, never copy. */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Icon, Text, usePremiumTheme } from '@/ui/premium';
import { MONETIZE_INK } from './monetize-palette';

export interface PauseMonthBar {
  readonly label: string;
  readonly name: string;
  readonly paused: boolean;
  readonly trip?: boolean;
}

const HATCH = 'repeating-linear-gradient(135deg, rgba(138,106,12,0.18) 0 3px, transparent 3px 6px)';

export function PauseMonthBars({ months }: { readonly months: readonly PauseMonthBar[] }) {
  const { t } = useLingui();
  const th = usePremiumTheme();
  const paused = months
    .filter((m) => m.paused)
    .map((m) => m.name)
    .join(', ');
  return (
    <View
      accessible
      accessibilityLabel={t({ id: 'monetize.premium.pausedMonths', message: `Paused: ${paused}` })}
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 10 }}
      testID="plan-cancel-bars"
    >
      {months.map((m) => (
        <View key={m.name} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          {m.trip === true ? (
            <Icon name="send" size={18} color={th.color.status.maybe.text} />
          ) : null}
          <View
            style={{
              alignSelf: 'stretch',
              height: m.paused ? 26 : 44,
              borderRadius: 8,
              backgroundColor: m.paused ? 'transparent' : MONETIZE_INK.monthOn,
              ...(m.paused
                ? {
                    experimental_backgroundImage: HATCH,
                    boxShadow: 'inset 0 0 0 1.5px rgba(138,106,12,0.35)',
                  }
                : {}),
            }}
          />
          <Text variant="badge" color={th.color.status.maybe.text}>
            {m.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
