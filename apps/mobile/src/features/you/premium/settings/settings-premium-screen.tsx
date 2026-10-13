/**
 * Settings (9.04): the large title in the content, the plan chip as the one right action, then
 * each section as a card of rows (values open their page, switches save at once, a private row
 * says so, the destructive one is pink). How chatty is a small segmented control in its row.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { SettingsRow } from '@/ui/premium/cards/settings-row';
import { Icon, ListCard, Row, SegmentedControl, Text, Toggle, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { AccountServices } from '../../account/account-services';
import { useSettingsModel } from '../../settings/use-settings-model';
import { playTokekTheme } from '../../settings/tokek-theme';
import { CrewChatChoice } from './crew-chat-choice';

function PremiumSettingsRow({
  row,
  chatty,
}: {
  readonly row: SettingsRow;
  readonly chatty: ReactNode;
}) {
  const th = usePremiumTheme();
  const sub = row.subtitle === undefined ? {} : { subtitle: row.subtitle };
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a test hook, never copy.
  const id = row.testID ?? `you-settings-${row.key}`;
  switch (row.kind) {
    case 'value':
      return (
        <Row
          title={row.title}
          {...sub}
          {...(row.value === '' ? {} : { trailingText: row.value })}
          trailing={<Icon name="forward" size={16} color={th.color.placeholder} />}
          onPress={row.disabled === true ? undefined : row.onPress}
          testID={id}
        />
      );
    case 'toggle':
      return (
        <Row
          title={row.title}
          {...sub}
          trailing={
            <Toggle
              value={row.value}
              onChange={row.onChange}
              accessibilityLabel={row.title}
              disabled={row.disabled === true}
              testID={`${id}-toggle`}
            />
          }
          testID={id}
        />
      );
    case 'check':
      return (
        <Row
          title={row.title}
          {...sub}
          trailing={row.checked ? <Icon name="check" size={18} color={th.color.ink} /> : undefined}
          onPress={row.onPress}
          testID={id}
        />
      );
    case 'private':
      return (
        <Row
          title={row.title}
          {...sub}
          trailing={<Icon name="lock" size={16} color={th.color.muted} />}
          onPress={row.onPress}
          testID={id}
        />
      );
    case 'destructive':
      return (
        <Pressable
          onPress={row.disabled === true ? undefined : row.onPress}
          disabled={row.disabled === true}
          accessibilityRole="button"
          accessibilityLabel={
            row.subtitle === undefined ? row.title : `${row.title}, ${row.subtitle}`
          }
          accessibilityState={{ disabled: row.disabled === true }}
          testID={id}
          style={{ paddingVertical: th.space.rowPadVLoose, paddingHorizontal: th.space.rowPadH }}
        >
          <Text
            variant="rowTitle"
            color={th.color.destructive.listAction}
            style={row.disabled === true ? { opacity: 0.5 } : undefined}
          >
            {row.title}
          </Text>
          {row.subtitle === undefined ? null : (
            <Text variant="caption" tone="muted">
              {row.subtitle}
            </Text>
          )}
        </Pressable>
      );
    case 'custom':
      return (
        <Row
          title={row.title}
          {...sub}
          trailing={row.key === 'chattiness' ? chatty : row.trailing}
          testID={id}
        />
      );
  }
}

export function SettingsPremiumScreen({
  services,
}: {
  /** The account's reads; the device's own by default. */
  readonly services?: AccountServices;
} = {}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const model = useSettingsModel(services);
  const chatty = (
    <View style={{ width: 180 }}>
      <SegmentedControl
        options={[
          { value: 'quiet', label: t({ id: 'you.premium.chatty.quiet', message: 'Quiet' }) },
          { value: 'normal', label: t({ id: 'you.premium.chatty.normal', message: 'Normal' }) },
          { value: 'chatty', label: t({ id: 'you.premium.chatty.chatty', message: 'Chatty' }) },
        ]}
        value={model.chattiness}
        onChange={model.setChattiness}
        accessibilityLabel={t({ id: 'you.settings.howChatty', message: 'How chatty' })}
        testID="you-settings-chattiness"
      />
    </View>
  );
  const plan = model.plan;
  return (
    <PushScreen
      title={t({ id: 'you.profile.settings', message: 'Settings' })}
      backLabel={t({ id: 'you.profile.backPass', message: 'Pass' })}
      testID="you-settings"
      {...(plan === null
        ? {}
        : {
            action: {
              key: 'plan',
              label: plan.label,
              // eslint-disable-next-line lingui/no-unlocalized-strings -- an SF Symbol name, never copy.
              sfSymbol: 'star.circle',
              glyph: 'pass' as const,
              onPress: plan.onPress,
              testID: 'you-settings-plan',
              element: (
                <Pressable
                  onPress={plan.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={plan.label}
                  style={{
                    height: 32,
                    paddingHorizontal: 12,
                    borderRadius: 16,
                    backgroundColor: th.accent.sun,
                    justifyContent: 'center',
                  }}
                >
                  <Text variant="noteAction" tone="onAccent">
                    {`${plan.label} ›`}
                  </Text>
                </Pressable>
              ),
            },
          })}
    >
      <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap6 }}>
        {model.sections
          .filter((section) => section.rows.length > 0)
          .map((section) => (
            <View key={section.id} style={{ gap: th.space.gap4, marginTop: th.space.gap10 }}>
              <Text
                variant="caption"
                tone="muted"
                style={{ paddingHorizontal: 6 }}
                accessibilityRole="header"
              >
                {section.title}
              </Text>
              <ListCard radius={20} testID={`you-settings-${section.id}`}>
                {section.rows.map((row) =>
                  row.key === 'crew-chat' && row.kind === 'value' ? (
                    <CrewChatChoice
                      key={row.key}
                      title={row.title}
                      value={row.value}
                      selected={model.crewChat}
                      onSelect={model.setCrewChat}
                    />
                  ) : (
                    <PremiumSettingsRow key={row.key} row={row} chatty={chatty} />
                  ),
                )}
              </ListCard>
            </View>
          ))}
        <Pressable
          onPress={playTokekTheme}
          accessibilityRole="button"
          style={{ alignItems: 'center', paddingVertical: th.space.gap16 }}
          testID="you-settings-version"
        >
          <Text variant="mono" tone="placeholder">
            {model.version}
          </Text>
        </Pressable>
      </View>
    </PushScreen>
  );
}
