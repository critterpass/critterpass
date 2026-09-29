/** The organiser's own max, one row under the breakdown: "Your max · Set ✓ · change" or "Add yours". */
import { t } from '@lingui/core/macro';

import { TextLink } from '@/ui/buttons/TextLink';
import { Card } from '@/ui/cards/Card';
import { Row } from '@/ui/layout/Row';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  card: { paddingHorizontal: th.space['16'], paddingVertical: th.space['10'] },
  row: { gap: th.space['8'] },
  grow: { flex: 1 },
}));

export function OwnMaxRow({
  set,
  onChange,
}: {
  readonly set: boolean;
  readonly onChange: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Card style={styles.card} testID="budget-own-max">
      <Row align="center" style={styles.row}>
        <Text variant="rowTitle" style={styles.grow}>
          {t({ id: 'setup.budget.member.yourMax', message: 'Your max' })}
        </Text>
        {set ? (
          <Text variant="label" color={theme.semantic.state.success}>
            {t({ id: 'setup.budget.member.set', message: 'Set ✓' })}
          </Text>
        ) : null}
        <TextLink
          label={
            set
              ? t({ id: 'setup.budget.member.change', message: 'change' })
              : t({ id: 'setup.budget.own.add', message: 'Add yours' })
          }
          onPress={onChange}
          testID="budget-own-max-change"
        />
      </Row>
    </Card>
  );
}
