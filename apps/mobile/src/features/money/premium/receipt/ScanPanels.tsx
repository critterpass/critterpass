/**
 * The receipt sheets in the premium look, over the camera (7.19, 7.20). Couldn't read the lines:
 * the guide got half of it, what was read (the total, at the shop) and what was not, "Type the
 * lines" or "Retake, flatter", and "Split evenly · $11.37 each". Check the receipt: a pink banner
 * while the lines miss the printed total (keep the total, or fix the lines), each line with who
 * had it (tap to change), what each person pays, who paid, and "Split it".
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useWalletGuide } from '@/features/bookings';
import { crewAccent, guideCritterKind } from '@/features/trip';
import {
  Avatar,
  Button,
  CritterSticker,
  Icon,
  PressableScale,
  Text,
  TextButton,
  Toggle,
  usePremiumTheme,
} from '@/ui/premium';

import type { FailureSheetProps } from '../../receipt/FailureSheet';
import type { LineAssignSheetProps } from '../../receipt/LineAssignSheet';
import type { ScanScene } from '../../receipt/ScanView';

function Sheet({ children, testID }: { readonly children: ReactNode; readonly testID: string }) {
  const th = usePremiumTheme();
  return (
    <View
      style={[
        styles.sheet,
        { backgroundColor: th.color.ground, borderTopLeftRadius: 34, borderTopRightRadius: 34 },
      ]}
      testID={testID}
    >
      <View style={[styles.grabber, { backgroundColor: th.color.outlineEmpty }]} />
      {children}
    </View>
  );
}

function ReceiptFailure(props: FailureSheetProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const guide = useWalletGuide();
  const guideName = guide.name;
  const { total, merchant, each } = props;
  return (
    <Sheet testID="money-scan-failure">
      <View style={styles.row}>
        <CritterSticker kind={guideCritterKind(guide.id)} name={guideName} size={44} pose="think" />
        <Text variant="badge" tone="muted">
          {t({ id: 'money.failure.eyebrow', message: `${guideName} got half of it` })}
        </Text>
      </View>
      <Text variant="emptyTitle">
        {t({ id: 'money.failure.title', message: 'The total, not the lines' })}
      </Text>
      <View
        style={[
          styles.card,
          {
            borderRadius: th.radius.banner,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
      >
        <View style={styles.row}>
          <View style={[styles.mark, { backgroundColor: th.color.status.booked.bg }]}>
            <Icon name="check" size={12} color={th.color.status.booked.text} />
          </View>
          <Text variant="rowText" style={styles.flex}>
            {merchant === null
              ? t({ id: 'money.failure.total', message: `Total: ${total}` })
              : t({ id: 'money.failure.totalAt', message: `Total: ${total} at ${merchant}` })}
          </Text>
        </View>
        <View
          style={[
            styles.row,
            { borderTopWidth: 0.5, borderTopColor: th.color.hairline, paddingTop: 10 },
          ]}
        >
          <View style={[styles.mark, { backgroundColor: th.color.status.voteOpen.bg }]}>
            <Icon name="close" size={12} color={th.color.status.voteOpen.text} />
          </View>
          <Text variant="rowText" style={styles.flex}>
            {t({
              id: 'money.failure.missed',
              message: `Line items: ${guideName} could not read them`,
            })}
          </Text>
        </View>
      </View>
      <View style={styles.pair}>
        <View style={styles.flex}>
          <Button
            label={t({ id: 'money.failure.type', message: 'Type the lines' })}
            size="medium"
            variant="secondary"
            onPress={props.onTypeLines}
            testID="money-failure-type"
          />
        </View>
        <View style={styles.flex}>
          <Button
            label={t({ id: 'money.failure.retake', message: 'Retake, flatter' })}
            size="medium"
            variant="secondary"
            onPress={props.onRetake}
            testID="money-failure-retake"
          />
        </View>
      </View>
      <Button
        label={t({ id: 'money.failure.even', message: `Split evenly · ${each} each` })}
        onPress={props.onEven}
        testID="money-failure-even"
      />
    </Sheet>
  );
}

function ReceiptReview(props: LineAssignSheetProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const count = props.rows.length;
  const payer = props.payerName;
  const guideName = useWalletGuide().name;
  return (
    <Sheet testID="money-scan-review">
      <Text variant="title">
        {t({
          id: 'money.review.title',
          message: plural(count, {
            one: `${guideName} read # line`,
            other: `${guideName} read # lines`,
          }),
        })}
      </Text>
      {props.mismatch === null ? null : (
        <View
          style={[
            styles.card,
            { borderRadius: th.radius.banner, backgroundColor: th.color.destructive.bg },
          ]}
          testID="money-review-mismatch"
        >
          <Text variant="rowTextStrong" color={th.color.destructive.text}>
            {props.mismatch.text}
          </Text>
          <View style={styles.row}>
            <Text variant="caption" style={styles.flex}>
              {t({ id: 'money.review.keepTotal', message: 'Keep total' })}
            </Text>
            <Toggle
              value={props.mismatch.keep}
              onChange={props.onKeepTotal}
              accessibilityLabel={t({ id: 'money.review.keepTotal', message: 'Keep total' })}
              testID="money-review-keep"
            />
          </View>
          {props.onFix === undefined ? null : (
            <TextButton
              label={t({ id: 'money.failure.type', message: 'Type the lines' })}
              onPress={props.onFix}
              testID="money-review-fix"
            />
          )}
        </View>
      )}
      <ScrollView style={styles.lines} contentContainerStyle={{ gap: 0 }}>
        <View
          style={[
            styles.card,
            {
              borderRadius: th.radius.card,
              backgroundColor: th.color.card,
              boxShadow: th.shadow.card,
            },
          ]}
        >
          {props.rows.map((row, index) => (
            <PressableScale
              key={row.lineId}
              onPress={() => props.onLine(row.lineId)}
              disabled={row.byShare}
              pressedScale={0.99}
              accessibilityRole="button"
              testID={`money-review-line-${row.lineId}`}
            >
              <View
                style={[
                  styles.line,
                  index === 0 ? null : { borderTopWidth: 0.5, borderTopColor: th.color.hairline },
                ]}
              >
                <Text variant="rowText" style={styles.flex} numberOfLines={1}>
                  {row.label}
                </Text>
                {row.assignees === null ? (
                  <Text variant="badge" tone="muted">
                    {row.chip.text}
                  </Text>
                ) : (
                  <View style={styles.faces}>
                    {row.assignees.slice(0, 3).map((member, at) => (
                      <View key={member.userId} style={at === 0 ? null : styles.overlap}>
                        <Avatar
                          name={member.name}
                          color={crewAccent(member.joinIndex)}
                          size={22}
                          ringed
                        />
                      </View>
                    ))}
                  </View>
                )}
                {row.check === null ? null : (
                  <Text
                    variant="rowTextStrong"
                    color={th.color.destructive.text}
                    style={styles.tabular}
                  >
                    {row.check}
                  </Text>
                )}
              </View>
            </PressableScale>
          ))}
        </View>
      </ScrollView>
      <View style={{ gap: 2 }}>
        {props.summary.map((part) => (
          <View key={part.who} style={styles.row}>
            <Text variant="rowText" tone="inkSecondary" style={styles.flex}>
              {part.who}
            </Text>
            <Text variant="rowTextStrong" style={styles.tabular}>
              {part.amount}
            </Text>
          </View>
        ))}
      </View>
      <TextButton
        label={t({ id: 'money.review.changePayer', message: 'Someone else paid?' })}
        onPress={props.onPayer}
        testID="money-review-payer"
      />
      <Button
        label={t({ id: 'money.premium.splitIt', message: `Split it · ${payer} paid` })}
        loading={props.committing}
        onPress={props.onCommit}
        testID="money-review-commit"
      />
    </Sheet>
  );
}

/** The premium sheet for a scene, or null to keep the camera's own panel. */
export function premiumScanPanel(scene: ScanScene): ReactNode | null {
  if (scene.kind === 'review') return <ReceiptReview {...scene.review} />;
  if (scene.kind === 'failure') return <ReceiptFailure {...scene.failure} />;
  return null;
}

const styles = StyleSheet.create({
  sheet: { padding: 20, paddingTop: 8, gap: 12, maxHeight: 620 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  card: { padding: 14, gap: 10 },
  mark: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pair: { flexDirection: 'row', gap: 8 },
  lines: { maxHeight: 260 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  faces: { flexDirection: 'row' },
  overlap: { marginLeft: -8 },
  tabular: { fontVariant: ['tabular-nums'] },
});
