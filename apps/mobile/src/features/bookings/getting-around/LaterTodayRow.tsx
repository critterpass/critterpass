/** One of today's later legs (3h-3 LATER TODAY): where to where, the driving time, OPEN GRAB and LOG IT. */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

export interface LaterTodayRowProps {
  readonly from: string;
  readonly to: string;
  readonly detail: string | null;
  /** "Open Grab", or null where no ride app runs. */
  readonly openLabel: string | null;
  /** The ride app's link is being fetched. */
  readonly opening?: boolean | undefined;
  readonly onOpen: () => void;
  readonly onLog: () => void;
  readonly testID?: string;
}

export function LaterTodayRow({
  from,
  to,
  detail,
  openLabel,
  opening = false,
  onOpen,
  onLog,
  testID,
}: LaterTodayRowProps) {
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  return (
    <Stack gap="8" testID={testID}>
      <Row gap="12" align="center">
        <Icon name="food" size={28} decorative />
        <Stack gap="2" style={{ flex: 1 }}>
          <Text variant="rowTitle">{upper(`${from} → ${to}`, locale)}</Text>
          {detail ? (
            <Text variant="caption" color={theme.semantic.text.secondary}>
              {detail}
            </Text>
          ) : null}
        </Stack>
      </Row>
      <Row gap="8" style={{ justifyContent: 'flex-end' }}>
        {openLabel ? (
          <PillButton
            size="sm"
            tone="ink"
            label={openLabel}
            onPress={onOpen}
            loading={opening}
            block={false}
          />
        ) : null}
        <PillButton
          size="sm"
          variant="secondary"
          label={t({ id: 'suppliers.later.log', message: 'Log it' })}
          onPress={onLog}
          block={false}
        />
      </Row>
    </Stack>
  );
}
