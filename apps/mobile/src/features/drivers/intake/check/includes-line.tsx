/**
 * What the price includes (6c-2): fuel, parking, tolls and entry as chips; tapping one cycles it
 * through included, extra and not said.
 */
import type { DriverCard, IncludeKey } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { SAID_PILL_HEIGHT, SaidPill } from '../../shared/said-pill';
import { CheckDot } from './check-dot';

const NEXT = { unknown: 'yes', yes: 'no', no: 'unknown' } as const;
const KEYS = ['fuel', 'parking', 'tolls', 'entry'] as const;

export function IncludesLine(props: {
  readonly card: DriverCard;
  readonly checked: boolean;
  readonly label: string;
  readonly includeLabel: Readonly<Record<IncludeKey, string>>;
  readonly onCheck: () => void;
  readonly onChange: (card: DriverCard) => void;
}) {
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const { card } = props;
  return (
    <Row gap="12" align="flex-start">
      <CheckDot on={props.checked} onPress={props.onCheck} />
      <Stack gap="6" style={{ flex: 1 }}>
        <Text variant="eyebrow" color={theme.semantic.text.secondary}>
          {upper(props.label, locale)}
        </Text>
        <Row gap="6" wrap>
          {KEYS.map((key) => {
            const said = card.includes[key] ?? 'unknown';
            const item = props.includeLabel[key];
            const text =
              said === 'yes'
                ? `✓${item}`
                : said === 'no'
                  ? t({ id: 'drivers.check.notIncl', message: `${item} extra` })
                  : `${item}?`;
            return (
              <PressScale
                key={key}
                accessibilityLabel={item}
                onPress={() =>
                  props.onChange({ ...card, includes: { ...card.includes, [key]: NEXT[said] } })
                }
                style={{ minHeight: SAID_PILL_HEIGHT, minWidth: 0 }}
                testID={`drivers-check-include-${key}`}
              >
                <SaidPill tone={said === 'yes' ? 'said' : said === 'no' ? 'plain' : 'unsaid'}>
                  {upper(text, locale)}
                </SaidPill>
              </PressScale>
            );
          })}
        </Row>
      </Stack>
    </Row>
  );
}
