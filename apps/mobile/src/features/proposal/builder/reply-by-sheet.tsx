/**
 * The reply-by picker (3f-1 "Reply by ›"): the evenings the crew can still answer by, none after
 * the earliest free cancellation of a booked stay (so nobody pays for a room the crew hasn't
 * agreed to) and none after the trip starts. The first row keeps the guide's own pick.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { SettingsGroup, type SettingsRow } from '@/ui/inputs/SettingsGroup';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { instantDate, instantDateTime } from '../data/format';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'], gap: th.space['12'] },
}));

export interface ReplyBySheetProps {
  readonly locale: string;
  readonly choices: readonly Date[];
  /** The deadline the guide would pick, when there is one. */
  readonly fallback: Date | null;
  readonly value: string | null;
  /** The earliest free cancellation of a booked stay, which bounds every choice. */
  readonly freeCancelUntil: string | null;
  readonly onPick: (value: string | null) => void;
  readonly onClose: () => void;
}

export function ReplyBySheet(props: ReplyBySheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { locale } = props;
  const rows: SettingsRow[] = [
    {
      key: 'default',
      kind: 'check',
      title:
        props.fallback === null
          ? t({ id: 'proposal.replyBy.auto', message: 'Let the guide pick' })
          : t({
              id: 'proposal.replyBy.autoAt',
              message: `Guide’s pick · ${instantDateTime(locale, props.fallback.toISOString())}`,
            }),
      checked: props.value === null,
      onPress: () => props.onPick(null),
    },
    ...props.choices.map((at): SettingsRow => ({
      key: at.toISOString(),
      kind: 'check',
      title: instantDateTime(locale, at.toISOString()),
      checked: props.value !== null && new Date(props.value).getTime() === at.getTime(),
      onPress: () => props.onPick(at.toISOString()),
    })),
  ];
  return (
    <Sheet
      title={t({ id: 'proposal.replyBy.title', message: 'Reply by' })}
      detents={['medium', 'large']}
      onDismiss={props.onClose}
      testID="reply-by-sheet"
    >
      <SheetScrollView>
        <View style={styles.body}>
          <Text variant="body" color={theme.semantic.text.secondary}>
            {props.freeCancelUntil === null
              ? t({
                  id: 'proposal.replyBy.whyStart',
                  message: 'The crew answers before the trip starts.',
                })
              : t({
                  id: 'proposal.replyBy.whyCancel',
                  message: `Free cancellation on your stay ends ${instantDate(locale, props.freeCancelUntil)}, so the crew answers before then.`,
                })}
          </Text>
          <SettingsGroup rows={rows} testID="reply-by-options" />
        </View>
      </SheetScrollView>
    </Sheet>
  );
}
