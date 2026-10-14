/**
 * The guide's changes (4.48), one review: the privacy chip when it is yours alone, "7 changes,
 * nothing moved yet" and what the totals do, each change grouped under its day with a tick (an
 * unticked one fades and is struck through), what needs you, the totals, and the foot: put it in
 * the plan or send it to the crew as one vote, or keep it for yourself. A member votes yes or no
 * on a set someone sent. Every read and action is the shared `ChangesReviewScreen`'s.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  Checkbox,
  ListCard,
  LoadingCritter,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { ChangesReviewViewProps } from '../../review/changes-review-props';

export function PremiumChangesView(props: ChangesReviewViewProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const title = props.state === 'ready' ? props.title : '';
  return (
    <PushScreen
      title={title}
      {...(props.onlyYou === null ? {} : { subtitle: props.onlyYou })}
      backLabel={props.backLabel}
      scroll={false}
      testID="plan-review"
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.space.gutter,
          paddingVertical: theme.space.gap16,
          gap: theme.space.gap12,
        }}
      >
        {props.state === 'loading' ? (
          <LoadingCritter
            label={t({ id: 'plan.premium.review.loading', message: 'Reading the changes' })}
          />
        ) : props.state === 'missing' ? (
          <Text variant="body" testID="plan-review-missing">
            {t({
              id: 'plan.review.missing',
              message: 'This change isn’t on your phone yet. It shows up once it syncs.',
            })}
          </Text>
        ) : (
          <>
            <Text variant="display" accessibilityRole="header">
              {props.title}
            </Text>
            <Text variant="body" tone="muted">
              {props.summary}
            </Text>
            {props.notice === null ? null : (
              <Text variant="caption" tone="inkSecondary">
                {props.notice}
              </Text>
            )}
            <ListCard>
              {props.rows.map((row, index) => {
                const header = index === 0 || props.rows[index - 1]?.dayTag !== row.dayTag;
                return (
                  <View key={row.key}>
                    {header ? (
                      <Text
                        variant="badge"
                        color={row.dayColor}
                        style={{
                          paddingTop: theme.space.gap8,
                          paddingHorizontal: theme.space.gap12,
                        }}
                      >
                        {row.dayTag.toLocaleUpperCase()}
                      </Text>
                    ) : null}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: theme.space.gap10,
                        paddingVertical: theme.space.gap10,
                        paddingHorizontal: theme.space.gap12,
                        opacity: row.accepted ? 1 : 0.5,
                      }}
                    >
                      {props.onToggle === null ? null : (
                        <Checkbox
                          checked={row.accepted}
                          onChange={(next) => props.onToggle?.(row.key, next)}
                          accessibilityLabel={row.title}
                          testID={`plan-review-tick-${row.key}`}
                        />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text
                          variant="rowTextStrong"
                          style={row.accepted ? undefined : { textDecorationLine: 'line-through' }}
                        >
                          {row.title}
                        </Text>
                        <Text variant="captionMuted" tone="muted">
                          {row.detail}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ListCard>
            {props.needsYou.length === 0 ? null : (
              <ListCard>
                {props.needsYou.map((row) => (
                  <View key={row.key} style={{ padding: theme.space.gap12, gap: 2 }}>
                    <Text variant="rowTextStrong">{row.name}</Text>
                    <Text variant="captionMuted" tone="muted">
                      {row.line}
                    </Text>
                    {row.explainer === null ? (
                      <TextButton
                        label={t({ id: 'plan.premium.review.see', message: 'See' })}
                        onPress={row.onSee}
                      />
                    ) : (
                      <Text variant="caption">{row.explainer}</Text>
                    )}
                  </View>
                ))}
              </ListCard>
            )}
            {props.totals}
            {props.vote === null ? null : (
              <View style={{ gap: theme.space.gap8 }} testID="plan-review-vote">
                <Text variant="rowText">{props.vote.line}</Text>
                {props.vote.canVote ? (
                  <View style={{ flexDirection: 'row', gap: theme.space.gap8 }}>
                    <Button
                      size="small"
                      label={t({ id: 'plan.premium.review.yes', message: 'Yes' })}
                      onPress={props.vote.onYes}
                      testID="plan-review-yes"
                    />
                    <Button
                      size="small"
                      variant="control"
                      label={t({ id: 'plan.premium.review.no', message: 'No' })}
                      onPress={props.vote.onNo}
                      testID="plan-review-no"
                    />
                  </View>
                ) : null}
              </View>
            )}
          </>
        )}
      </ScrollView>
      <View
        style={{
          paddingHorizontal: theme.space.titleGutter,
          paddingBottom: insets.bottom + theme.space.gap12,
          gap: theme.space.gap4,
          alignItems: 'center',
        }}
      >
        {props.seeDay == null ? null : (
          <View style={{ alignSelf: 'stretch' }}>
            <Button
              label={props.seeDay.label}
              onPress={props.seeDay.onPress}
              testID="plan-review-see-day"
            />
          </View>
        )}
        {props.send === null ? null : (
          <View style={{ alignSelf: 'stretch' }}>
            <Button
              label={props.send.label}
              onPress={props.send.onPress}
              disabled={props.send.disabled}
              loading={props.send.busy}
              testID="plan-review-send"
            />
          </View>
        )}
        {props.ask == null ? null : (
          <TextButton
            align="center"
            label={props.ask.label}
            onPress={props.ask.onPress}
            disabled={props.ask.disabled}
            testID="plan-review-ask"
          />
        )}
        {props.personal === null ? null : (
          <TextButton
            label={t({ id: 'plan.premium.review.mine', message: 'Apply to my plan only' })}
            onPress={props.personal.onPress}
            testID="plan-review-personal"
          />
        )}
      </View>
    </PushScreen>
  );
}
